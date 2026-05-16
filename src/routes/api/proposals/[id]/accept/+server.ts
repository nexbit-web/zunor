// src/routes/api/proposals/[id]/accept/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { Notify } from '$lib/server/notifications'
import type { RequestHandler } from './$types'

/**
 * POST /api/proposals/[id]/accept — клиент выбирает мастера.
 *
 * Атомарно:
 *   1. Создаёт Chat (client + master)
 *   2. Создаёт Order (status=CREATED, chatId)
 *   3. Этот proposal → ACCEPTED
 *   4. Остальные proposals → REJECTED
 *   5. Job → IN_PROGRESS + selectedOrderId
 *   6. OrderEvent(CREATED)
 *
 * После (fail-soft):
 *   - Notification мастеру
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

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
          clientId: true,
          status: true,
        },
      },
    },
  })

  if (!proposal) throw error(404, 'Proposal не знайдено')

  // Только владелец job может принимать
  if (proposal.job.clientId !== session.user.id) {
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
    // 1. Создаём Chat с двумя участниками
    const chat = await tx.chat.create({
      data: {
        members: {
          create: [{ userId: session.user.id }, { userId: proposal.masterId }],
        },
      },
      select: { id: true },
    })

    // 2. Создаём Order
    const order = await tx.order.create({
      data: {
        clientId: session.user.id,
        masterId: proposal.masterId,
        title: proposal.job.title,
        description: proposal.job.description,
        priceCents: proposal.priceCents,
        currency: 'UAH',
        status: 'CREATED',
        chatId: chat.id,
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
        actorId: session.user.id,
        payload: {
          jobId: proposal.jobId,
          proposalId: proposal.id,
        } as any,
      },
    })

    return order
  })

  // Notification мастеру (fail-soft)
  try {
    await Notify.proposalAccepted(proposal.masterId, proposal.jobId, result.id)
  } catch (err) {
    console.error('[proposal:accept] notify failed', err)
  }

  return json({ order: result }, { status: 201 })
}
