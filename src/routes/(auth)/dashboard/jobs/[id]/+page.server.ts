import { requireUser } from '$lib/server/guards'
import { loadJobDetail } from '$lib/server/job-detail'
import { prisma } from '$lib/server/prisma'
import { error, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

/**
 * Заявка. Дані, доступ, пропозиції й «чи може майстер відгукнутись» —
 * $lib/server/job-detail: спільні з GET /api/jobs/[id], яким заявку
 * відкриває застосунок.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
  const userId = requireUser(locals).id

  const detail = await loadJobDetail(params.id, userId, { track: true })
  if (!detail) {
    // Сесія є, а користувача вже немає (видалений) — на вхід, як і раніше.
    const exists = await prisma.user.count({ where: { id: userId } })
    if (!exists) throw redirect(302, '/user/login')
    throw error(404, 'Заявку не знайдено')
  }

  // closedAt сторінці не потрібен — віддаємо те саме, що й раніше.
  const { closedAt: _closedAt, ...job } = detail.job

  return {
    job: {
      ...job,
      category: detail.categoryName,
      categorySlug: job.category,
      city: detail.cityName,
      citySlug: job.city,
      place: detail.place,
      createdAt: job.createdAt.toISOString(),
      expiresAt: job.expiresAt.toISOString(),
      editedAt: job.editedAt?.toISOString() ?? null,
      client: {
        ...job.client,
        avgRating: job.client.avgRatingAsClient,
        reviewsCount: job.client.reviewsCountAsClient,
        createdAt: job.client.createdAt.toISOString(),
      },
    },
    proposals: detail.proposals,
    viewerId: userId,
    isOwner: detail.isOwner,
    isMaster: detail.isMaster,
    canPropose: detail.canPropose,
    cantProposeReason: detail.cantProposeReason,
  }
}
