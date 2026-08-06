import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import {
  canTransition,
  getActor,
  nextStatus,
  type OrderTransition,
} from '$lib/server/order-state-machine'
import { channels, events, safeTrigger } from '$lib/server/pusher'
import { Notify } from '$lib/server/notifications'
import { dispatchJob } from '$lib/server/dispatch'
import type { RequestHandler } from './$types'

/**
 * POST /api/orders/[id]/[action]
 *
 * action ∈ ['start', 'complete', 'cancel']
 *
 * Чат — тільки для спілкування: зміна статусу НЕ створює повідомлення
 * у стрічці. Замість цього:
 *   - broadcast 'order:status' → плашка в шапці чату оновлюється live;
 *   - OrderEvent → аудит;
 *   - Notify.* → сповіщення у дзвіночку.
 */

const ACTION_TO_TRANSITION: Record<string, OrderTransition> = {
  start: 'START',
  complete: 'COMPLETE',
  cancel: 'CANCEL',
}

function transitionToEventType(transition: OrderTransition): string {
  switch (transition) {
    case 'START':
      return 'STARTED'
    case 'COMPLETE':
      return 'COMPLETED'
    case 'CANCEL':
      return 'CANCELLED'
  }
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = requireApiUser(locals)

  const transition = ACTION_TO_TRANSITION[params.action]
  if (!transition) throw error(400, 'Невідома дія')

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      clientId: true,
      masterId: true,
      chatId: true,
      fromJob: { select: { id: true, title: true } },
    },
  })
  if (!order) throw error(404, 'Замовлення не знайдено')

  const actor = getActor(user.id, order)
  if (!actor) throw error(403, 'Ви не учасник цього замовлення')

  const errMsg = canTransition(order.status, transition, actor)
  if (errMsg) throw error(400, errMsg)

  const newStatus = nextStatus(transition)
  const body = await request.json().catch(() => ({}) as Record<string, unknown>)

  // Транзакция перехода
  const updated = await prisma.$transaction(
    async (tx) => {
      const now = new Date()
      const data: Record<string, unknown> = {
        status: newStatus,
        updatedAt: now,
      }

      switch (transition) {
        case 'START': {
          data.startedAt = now
          // Инкремент totalOrders мастера
          await tx.masterProfile.update({
            where: { userId: order.masterId },
            data: { totalOrders: { increment: 1 } },
          })
          break
        }
        case 'COMPLETE': {
          data.completedAt = now
          await tx.masterProfile.update({
            where: { userId: order.masterId },
            data: { completedOrders: { increment: 1 } },
          })
          break
        }
        case 'CANCEL': {
          data.cancelledAt = now
          data.cancelledById = user.id
          const reason = String(body.reason ?? '').trim()
          if (reason.length > 500) throw error(400, 'Причина занадто довга')
          data.cancelReason = reason || null

          // Майстер відмовився → повертаємо заявку в пошук (manifest: клієнт не винен)
          if (actor === 'MASTER' && order.fromJob) {
            const jobId = order.fromJob.id

            // 1. Заявка знову відкрита + лічильник відгуків обнуляємо
            await tx.job.update({
              where: { id: jobId },
              data: {
                status: 'OPEN',
                closedAt: null,
                selectedOrderId: null,
                proposalsCount: 0,
              },
            })

            // 2. Видаляємо всі відгуки — заявка чиста, майстри відгукуються заново
            await tx.proposal.deleteMany({ where: { jobId } })

            // 3. Чорна мітка втікачу — мозок пам'ятає, що він відмовився.
            //    Запис лишається (не видаляємо) → і фільтр кандидатів його не покличе.
            await tx.dispatchEvent.updateMany({
              where: { jobId, masterId: order.masterId },
              data: { declined: true, respondedAt: null, openedAt: null },
            })

            // 4. Решту записів диспатчу видаляємо → redispatch покличе їх заново
            await tx.dispatchEvent.deleteMany({
              where: {
                jobId,
                masterId: { not: order.masterId },
                declined: false,
              },
            })
          }
          break
        }
      }

      const result = await tx.order.update({
        where: { id: order.id },
        data,
        select: {
          id: true,
          status: true,
          priceCents: true,
          currency: true,
          title: true,
          clientId: true,
          masterId: true,
          startedAt: true,
          completedAt: true,
          cancelledAt: true,
          cancelReason: true,
          chatId: true,
        },
      })

      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: transitionToEventType(transition),
          actorId: user.id,
          payload:
            transition === 'CANCEL' && data.cancelReason
              ? { reason: String(data.cancelReason) }
              : undefined,
        },
      })

      return result
    },
    {
      maxWait: 10000, // макс. чекати на з'єднання з пулу (Neon cold start)
      timeout: 20000, // макс. тривалість транзакції
    },
  )

  // ─── Статус → плашка в шапці чату (замість SYSTEM-повідомлення) ───
  // Fail-soft: якщо Pusher недоступний, статус приїде при наступному
  // завантаженні сторінки з load().
  if (updated.chatId) {
    await safeTrigger(channels.chat(updated.chatId), events.orderStatus, {
      orderId: updated.id,
      status: updated.status,
    })
  }

  // Майстер відмовився → перезапускаємо диспатч (мозок шукає заміну)
  if (transition === 'CANCEL' && actor === 'MASTER' && order.fromJob) {
    dispatchJob(order.fromJob.id, order.fromJob.title).catch((err) =>
      console.error('[order-action] redispatch failed', err),
    )
  }

  try {
    switch (transition) {
      case 'START':
        await Notify.orderStarted(updated.clientId, updated.id)
        break
      case 'COMPLETE':
        await Notify.orderCompleted(updated.clientId, updated.id)
        break
      case 'CANCEL': {
        if (actor === 'MASTER' && order.fromJob) {
          // Майстер відмовився → клієнту тепле повідомлення від Zuno
          await Notify.jobReopened(updated.clientId, order.fromJob.id)
        } else {
          // Клієнт скасував → майстру звичайне сповіщення
          await Notify.orderCancelled(
            updated.masterId,
            updated.id,
            updated.cancelReason ?? undefined,
          )
        }
        break
      }
    }
  } catch (err) {
    console.error('[order-action] notify error', err)
  }

  return json({ order: updated })
}
