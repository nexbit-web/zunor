// src/routes/api/proposals/[id]/accept/+server.ts
import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { Notify } from '$lib/server/notifications'
import { cancelWaves } from '$lib/server/dispatch/scheduler'
import type { RequestHandler } from './$types'

/**
 * POST /api/proposals/[id]/accept — клиент выбирает мастера.
 *
 * Атомарно:
 *   1. Создаёт Order (status=CREATED, БЕЗ чата)
 *   2. Этот proposal → ACCEPTED
 *   3. Остальные proposals → REJECTED
 *   4. Job → IN_PROGRESS + selectedOrderId
 *   5. OrderEvent(CREATED)
 *
 * Чат тут НЕ створюється. Раніше створювався — і кожен вибір майстра
 * плодив порожній чат, який одразу з'являвся в обох списках повідомлень,
 * хоча ніхто не написав жодного слова. Тепер він заводиться на першу
 * спробу написати: POST /api/orders/[id]/chat.
 *
 * После (fail-soft):
 *   - Notification мастеру
 */
export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      jobId: true,
      masterId: true,
      message: true,
      priceCents: true,
      estimatedDays: true,
      status: true,
      job: {
        select: {
          id: true,
          title: true,
          description: true,
          metadata: true,
          clientId: true,
          status: true,
        },
      },
    },
  })

  if (!proposal) throw error(404, 'Proposal не знайдено')

  // Только владелец job может принимать
  if (proposal.job.clientId !== user.id) {
    throw error(403, 'Тільки замовник може обрати майстра')
  }
  if (proposal.job.status !== 'OPEN') {
    throw error(400, 'Заявка вже закрита')
  }
  if (proposal.status !== 'SENT') {
    throw error(400, 'Цей відгук вже неактивний')
  }

  // Атомарная транзакция
  const result = await prisma.$transaction(async (tx) => {
    // 1. Создаём Order. chatId лишається null — чат заведе перший, хто
    //    натисне «Написати» (POST /api/orders/[id]/chat).
    const order = await tx.order.create({
      data: {
        clientId: user.id,
        masterId: proposal.masterId,
        title: proposal.job.title,
        description: proposal.job.description ?? '',
        metadata: proposal.job.metadata ?? undefined,
        priceCents: proposal.priceCents,
        currency: 'UAH',
        status: 'CREATED',
      },
      select: {
        id: true,
        title: true,
        priceCents: true,
        currency: true,
        status: true,
        chatId: true,
        clientId: true,
        masterId: true,
      },
    })

    // 3. Принятый proposal
    await tx.proposal.update({
      where: { id: proposal.id },
      data: { status: 'ACCEPTED' },
    })

    // 4. Остальные → REJECTED
    await tx.proposal.updateMany({
      where: {
        jobId: proposal.jobId,
        id: { not: proposal.id },
        status: 'SENT',
      },
      data: { status: 'REJECTED' },
    })

    // 5. Job → IN_PROGRESS
    await tx.job.update({
      where: { id: proposal.jobId },
      data: {
        status: 'IN_PROGRESS',
        closedAt: new Date(),
        selectedOrderId: order.id,
      },
    })

    // 6. Audit
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'CREATED',
        actorId: user.id,
        payload: {
          jobId: proposal.jobId,
          proposalId: proposal.id,
        } as any,
      },
    })

    return order
  })

  // Майстра обрано, заявка більше не приймає відгуки — знімаємо заплановані
  // хвилі, щоб таймер не будив базу заради закритої заявки.
  cancelWaves(proposal.jobId)

  // Notification мастеру (fail-soft)
  try {
    await Notify.proposalAccepted(proposal.masterId, proposal.jobId, result.id)
  } catch (err) {
    console.error('[proposal:accept] notify failed', err)
  }

  return json({ order: result }, { status: 201 })
}
