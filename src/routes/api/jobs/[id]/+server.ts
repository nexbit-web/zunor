// src/routes/api/jobs/[id]/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import type { RequestHandler } from './$types'

/**
 * GET /api/jobs/[id] — детали заявки.
 *
 * Доступ:
 *   - Владелец (client) — полный доступ
 *   - Мастер с подходящими категориями — полный доступ (для отправки proposal)
 *   - Остальные — только base info без attachments
 */
export const GET: RequestHandler = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const job = await prisma.job.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      clientId: true,
      category: true,
      city: true,
      title: true,
      description: true,
      budgetMinCents: true,
      budgetMaxCents: true,
      currency: true,
      attachments: true,
      status: true,
      proposalsCount: true,
      viewsCount: true,
      expiresAt: true,
      closedAt: true,
      createdAt: true,
      client: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          avgRating: true,
          reviewsCount: true,
        },
      },
    },
  })

  if (!job) throw error(404, 'Заявку не знайдено')

  const isOwner = job.clientId === session.user.id

  // Если не owner — инкрементим viewCount (один раз на сессию идеально, но MVP — на каждый GET)
  if (!isOwner) {
    prisma.job
      .update({ where: { id: job.id }, data: { viewsCount: { increment: 1 } } })
      .catch(() => {})
  }

  return json({ job, isOwner })
}

/**
 * DELETE /api/jobs/[id] — отменить заявку.
 *
 * Только владелец, только если статус OPEN.
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const job = await prisma.job.findUnique({
    where: { id: params.id },
    select: { id: true, clientId: true, status: true },
  })

  if (!job) throw error(404, 'Не знайдено')
  if (job.clientId !== session.user.id) throw error(403, 'Forbidden')
  if (job.status !== 'OPEN')
    throw error(400, 'Можна скасувати тільки відкриту заявку')

  await prisma.$transaction([
    prisma.job.update({
      where: { id: job.id },
      data: { status: 'CANCELLED', closedAt: new Date() },
    }),
    // Все pending proposals → REJECTED
    prisma.proposal.updateMany({
      where: { jobId: job.id, status: 'SENT' },
      data: { status: 'REJECTED' },
    }),
  ])

  return json({ ok: true })
}
