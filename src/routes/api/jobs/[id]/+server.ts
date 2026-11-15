import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { flattenClientRating } from '$lib/server/user-dto'
import { cancelWaves } from '$lib/server/dispatch'
import { editJob } from '$lib/server/job-edit'
import { loadJobDetail } from '$lib/server/job-detail'
import { limit } from '$lib/server/rate-limit'
import type { RequestHandler } from './$types'

/**
 * GET /api/jobs/[id] — деталі заявки (екран заявки в застосунку).
 *
 * Дані й доступ — $lib/server/job-detail, ті самі, що в сторінки сайту:
 * власник, релевантний майстер або майстер із власною пропозицією. Решта
 * отримує 404 (а не 403: інакше відповідь підтверджує існування чужої
 * заявки).
 *
 * `?open=1` — людина відкрила заявку: унікальний перегляд і «майстер
 * відкрив» для диспетчера, як на сторінці сайту. Обидва ідемпотентні
 * (один перегляд на глядача), тож оновлення екрана нічого не накручує.
 *
 * Контракт: поля, що були раніше, — ті самі (category / city — slug),
 * решта лише додана: number, metadata, effort, editedAt, place, categoryName,
 * cityName, client.createdAt; proposals, isMaster, canPropose,
 * cantProposeReason.
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
  const user = requireApiUser(locals)

  const detail = await loadJobDetail(params.id, user.id, {
    track: url.searchParams.get('open') === '1',
  })
  if (!detail) throw error(404, 'Заявку не знайдено')

  const { job } = detail
  const { city: _clientCity, ...client } = job.client
  return json({
    job: {
      ...job,
      client: {
        ...flattenClientRating(client),
        createdAt: client.createdAt.toISOString(),
      },
      editedAt: job.editedAt?.toISOString() ?? null,
      categoryName: detail.categoryName,
      cityName: detail.cityName,
      place: detail.place,
    },
    isOwner: detail.isOwner,
    isMaster: detail.isMaster,
    proposals: detail.proposals,
    canPropose: detail.canPropose,
    cantProposeReason: detail.cantProposeReason,
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
  const rl = await limit(`job:edit:${user.id}`, {
    points: 30,
    duration: 60 * 60_000,
  })
  if (!rl.success) throw error(429, 'Забагато змін. Спробуйте пізніше')

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') throw error(400, 'Invalid JSON')

  const result = await editJob(
    user.id,
    params.id,
    body as Record<string, unknown>,
  )
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
