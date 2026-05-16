// src/routes/api/orders/[id]/[action]/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import {
  canTransition,
  getActor,
  nextStatus,
  type OrderTransition,
} from '$lib/server/order-state-machine'
import { postOrderSystemMessage } from '$lib/server/system-message'
import { Notify } from '$lib/server/notifications'
import type { RequestHandler } from './$types'

/**
 * POST /api/orders/[id]/[action]
 *
 * action ∈ ['start', 'complete', 'cancel']
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

export const POST: RequestHandler = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

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
    },
  })
  if (!order) throw error(404, 'Замовлення не знайдено')

  const actor = getActor(session.user.id, order)
  if (!actor) throw error(403, 'Ви не учасник цього замовлення')

  const errMsg = canTransition(order.status, transition, actor)
  if (errMsg) throw error(400, errMsg)

  const newStatus = nextStatus(transition)
  const body = await request.json().catch(() => ({}) as Record<string, unknown>)

  // Транзакция перехода
  const updated = await prisma.$transaction(async (tx) => {
    const now = new Date()
    const data: any = { status: newStatus, updatedAt: now }

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
        data.cancelledById = session.user.id
        const reason = String(body.reason ?? '').trim()
        if (reason.length > 500) throw error(400, 'Причина занадто довга')
        data.cancelReason = reason || null
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
        actorId: session.user.id,
        payload:
          transition === 'CANCEL' && data.cancelReason
            ? ({ reason: data.cancelReason } as any)
            : null,
      },
    })

    return result
  })

  // System message + notification (fail-soft)
  const eventType = transitionToEventType(transition)

  if (updated.chatId) {
    try {
      await postOrderSystemMessage({
        chatId: updated.chatId,
        eventType,
        orderId: updated.id,
        actorId: session.user.id,
        extra:
          transition === 'CANCEL' && updated.cancelReason
            ? updated.cancelReason
            : undefined,
      })
    } catch (err) {
      console.error('[order-action] system message error', err)
    }
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
        const recipientId =
          actor === 'CLIENT' ? updated.masterId : updated.clientId
        await Notify.orderCancelled(
          recipientId,
          updated.id,
          updated.cancelReason ?? undefined,
        )
        break
      }
    }
  } catch (err) {
    console.error('[order-action] notify error', err)
  }

  return json({ order: updated })
}
