// src/routes/api/jobs/[id]/+server.ts
import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { clientRatingSelect, flattenClientRating } from '$lib/server/user-dto'
import { cancelWaves } from '$lib/server/dispatch/scheduler'
import type { RequestHandler } from './$types'

/**
 * GET /api/jobs/[id] — детали заявки.
 *
 * Доступ:
 *   - Владелец (client) — полный доступ
 *   - Мастер с подходящими категориями — полный доступ (для отправки proposal)
 *   - Остальные — только base info без attachments
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

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
          ...clientRatingSelect,
        },
      },
    },
  })

  if (!job) throw error(404, 'Заявку не знайдено')

  const isOwner = job.clientId === user.id

  // Перегляди тут НЕ рахуємо: лічильник веде сторінка заявки
  // (dashboard/jobs/[id]/+page.server.ts), яка робить це через JobView —
  // один унікальний перегляд на глядача. Другий інкремент у цьому
  // ендпоінті рахував би ту саму людину двічі й на кожен запит.
  return json({
    job: { ...job, client: flattenClientRating(job.client) },
    isOwner,
  })
}

/**
 * DELETE /api/jobs/[id] — отменить заявку.
 *
 * Только владелец, только если статус OPEN.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

  const job = await prisma.job.findUnique({
    where: { id: params.id },
    select: { id: true, clientId: true, status: true },
  })

  if (!job) throw error(404, 'Не знайдено')
  if (job.clientId !== user.id) throw error(403, 'Forbidden')
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

  // Заявки більше немає — знімаємо заплановані хвилі, щоб таймер не будив
  // базу заради розсилки, яку диспетчер однаково відхилить.
  cancelWaves(job.id)

  return json({ ok: true })
}
