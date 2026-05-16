// src/routes/api/proposals/[id]/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import type { RequestHandler } from './$types'

/**
 * GET /api/proposals/[id]
 * Доступ — тільки майстер-автор або власник job.
 */
export const GET: RequestHandler = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: {
      master: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          city: true,
          avgRating: true,
          reviewsCount: true,
          masterProfile: {
            select: {
              verificationStatus: true,
              completedOrders: true,
            },
          },
        },
      },
      job: {
        select: {
          id: true,
          title: true,
          clientId: true,
          status: true,
        },
      },
    },
  })

  if (!proposal) throw error(404, 'Не знайдено')

  const userId = session.user.id
  if (userId !== proposal.masterId && userId !== proposal.job.clientId) {
    throw error(403, 'Доступ заборонено')
  }

  return json({ proposal })
}

/**
 * DELETE /api/proposals/[id] — майстер відкликає свій відгук.
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      masterId: true,
      jobId: true,
      status: true,
    },
  })

  if (!proposal) throw error(404, 'Не знайдено')
  if (proposal.masterId !== session.user.id) {
    throw error(403, 'Не ваш відгук')
  }
  if (proposal.status !== 'SENT') {
    throw error(400, 'Можна відкликати тільки активний відгук')
  }

  await prisma.$transaction(async (tx) => {
    await tx.proposal.update({
      where: { id: proposal.id },
      data: {
        status: 'WITHDRAWN',
        withdrawnAt: new Date(),
      },
    })

    await tx.job.update({
      where: { id: proposal.jobId },
      data: { proposalsCount: { decrement: 1 } },
    })
  })

  return json({ ok: true })
}
