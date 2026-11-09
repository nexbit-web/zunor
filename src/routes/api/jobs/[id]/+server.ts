import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { clientRatingSelect, flattenClientRating } from '$lib/server/user-dto'
import { cancelWaves } from '$lib/server/dispatch'
import { checkJobAccess, jobViewerSelect } from '$lib/server/job-access'
import { editJob } from '$lib/server/job-edit'
import { limit } from '$lib/server/rate-limit'
import type { RequestHandler } from './$types'

/**
 * GET /api/jobs/[id] — деталі заявки.
 *
 * Доступ — за єдиним правилом з $lib/server/job-access: власник, релевантний
 * майстер або майстер із власною пропозицією. Решта отримує 404.
 *
 * Раніше тут не було жодної перевірки, окрім «залогінений»: коментар обіцяв
 * ховати attachments від сторонніх, а код віддавав усе — включно з фото
 * помешкання клієнта — будь-якому акаунту.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

  const [job, viewer] = await Promise.all([
    prisma.job.findUnique({
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
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: jobViewerSelect,
    }),
  ])

  if (!job) throw error(404, 'Заявку не знайдено')
  if (!viewer) throw error(404, 'Заявку не знайдено')

  const { canView, isOwner } = await checkJobAccess(job, {
    id: user.id,
    ...viewer,
  })
  // 404, а не 403: інакше відповідь підтверджує існування чужої заявки.
  if (!canView) throw error(404, 'Заявку не знайдено')

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
 * PATCH /api/jobs/[id] — змінити заявку. Лише власник і лише відкрита;
 * правила й побічні дії — у $lib/server/job-edit.
 *
 * Тіло — як у POST /api/jobs: { metadata, description, attachments,
 * attachmentsPublicIds }.
 */
export const PATCH: RequestHandler = async ({ params, locals, request }) => {
  const user = requireApiUser(locals)

  // Кожне збереження може сповістити майстрів — не частіше розумного.
  const rl = limit(`job:edit:${user.id}`, { points: 30, duration: 60 * 60_000 })
  if (!rl.success) throw error(429, 'Забагато змін. Спробуйте пізніше')

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') throw error(400, 'Invalid JSON')

  const result = await editJob(user.id, params.id, body as Record<string, unknown>)
  if (!result.ok) throw error(result.status, result.message)
  return json({ ok: true, changed: result.changed })
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
