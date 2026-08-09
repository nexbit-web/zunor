import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { masterRatingSelect, flattenMasterRating } from '$lib/server/user-dto'
import type { RequestHandler } from './$types'

/**
 * GET /api/proposals/[id]
 * Доступ — тільки майстер-автор або власник job.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

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
          ...masterRatingSelect,
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

  const userId = user.id
  if (userId !== proposal.masterId && userId !== proposal.job.clientId) {
    throw error(403, 'Доступ заборонено')
  }

  return json({
    proposal: { ...proposal, master: flattenMasterRating(proposal.master) },
  })
}

/**
 * DELETE /api/proposals/[id] — майстер відкликає свій відгук.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

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
  if (proposal.masterId !== user.id) {
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
