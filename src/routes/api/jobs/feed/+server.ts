import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { clientRatingSelect, flattenClientRating } from '$lib/server/user-dto'
import { moneyParam } from '$lib/server/query'
import type { RequestHandler } from './$types'

const PAGE_SIZE = 20

/**
 * GET /api/jobs/feed?view=mine|feed&cursor=...&categories=a,b&cities=x,y&minPrice=&maxPrice=
 *
 * Універсальний endpoint для пагінованої видачі заявок.
 * Повертає { jobs, nextCursor }.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  // Нижче в цьому ж хендлері `user` — це рядок із БД (роль, місто,
  // masterProfile), тому сесійного юзера тримаємо під іншим імʼям.
  const userId = requireApiUser(locals).id
  const view = url.searchParams.get('view') ?? 'mine'
  const cursor = url.searchParams.get('cursor')

  const categoriesParam = url.searchParams.get('categories') ?? ''
  const citiesParam = url.searchParams.get('cities') ?? ''
  const minPriceParam = url.searchParams.get('minPrice')
  const maxPriceParam = url.searchParams.get('maxPrice')

  const categoriesFilter = categoriesParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const citiesFilter = citiesParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // Сміття у фільтрі ціни — це «фільтра немає», а не NaN у запиті до бази.
  const minPriceCents = moneyParam(minPriceParam)
  const maxPriceCents = moneyParam(maxPriceParam)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      city: true,
      masterProfile: {
        select: {
          isActive: true,
          verificationStatus: true,
          categories: true,
        },
      },
    },
  })
  if (!user) throw error(401, 'Unauthorized')

  // ─── MINE ───
  if (view === 'mine') {
    const jobs = await prisma.job.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: 'desc' },
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      take: PAGE_SIZE + 1,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        city: true,
        status: true,
        budgetMinCents: true,
        budgetMaxCents: true,
        currency: true,
        proposalsCount: true,
        viewsCount: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    const hasMore = jobs.length > PAGE_SIZE
    const items = hasMore ? jobs.slice(0, PAGE_SIZE) : jobs
    const nextCursor = hasMore ? items[items.length - 1].id : null

    return json({
      jobs: items.map((j) => ({
        ...j,
        createdAt: j.createdAt.toISOString(),
        expiresAt: j.expiresAt.toISOString(),
      })),
      nextCursor,
    })
  }

  // ─── FEED ───
  if (user.role !== 'MASTER') {
    return json({ jobs: [], nextCursor: null })
  }

  const mp = user.masterProfile
  // Маніфест: впускаємо новачків. Verified — це бонус у scoring, не фільтр.
  // Достатньо активного профілю з містом і категорією.
  if (!mp?.isActive || !user.city || mp.categories.length === 0) {
    return json({ jobs: [], nextCursor: null })
  }

  // Фільтр категорій: тільки з тих, що в профілі мастера
  const allowedCategories =
    categoriesFilter.length > 0
      ? mp.categories.filter((c) => categoriesFilter.includes(c))
      : mp.categories

  // Фільтр міст: за замовчуванням — місто мастера
  const allowedCities = citiesFilter.length > 0 ? citiesFilter : [user.city]

  // Ціновий фільтр — заявка проходить якщо її діапазон перетинається із заданим
  const priceWhere: Record<string, unknown> = {}
  if (minPriceCents !== null) {
    priceWhere.OR = [
      { budgetMaxCents: { gte: minPriceCents } },
      { budgetMaxCents: null },
    ]
  }

  // Заявки, від яких майстер відмовився (чорна мітка) — приховуємо
  const declined = await prisma.dispatchEvent.findMany({
    where: { masterId: userId, declined: true },
    select: { jobId: true },
  })
  const declinedJobIds = declined.map((d) => d.jobId)

  const jobs = await prisma.job.findMany({
    where: {
      status: 'OPEN',
      city: { in: allowedCities },
      category: { in: allowedCategories },
      clientId: { not: userId },
      expiresAt: { gt: new Date() },
      ...(declinedJobIds.length > 0 ? { id: { notIn: declinedJobIds } } : {}),
      ...(maxPriceCents !== null && {
        OR: [
          { budgetMinCents: { lte: maxPriceCents } },
          { budgetMinCents: null },
        ],
      }),
      ...(minPriceCents !== null && {
        AND: [
          {
            OR: [
              { budgetMaxCents: { gte: minPriceCents } },
              { budgetMaxCents: null },
            ],
          },
        ],
      }),
    },
    orderBy: { createdAt: 'desc' },
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      title: true,
      description: true,
      metadata: true,
      category: true,
      city: true,
      status: true,
      budgetMinCents: true,
      budgetMaxCents: true,
      currency: true,
      proposalsCount: true,
      viewsCount: true,
      expiresAt: true,
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

  const hasMore = jobs.length > PAGE_SIZE
  const items = hasMore ? jobs.slice(0, PAGE_SIZE) : jobs
  const nextCursor = hasMore ? items[items.length - 1].id : null

  return json({
    jobs: items.map((j) => ({
      ...j,
      // Автор заявки — це замовник, тому показуємо його клієнтський рейтинг.
      client: flattenClientRating(j.client),
      createdAt: j.createdAt.toISOString(),
      expiresAt: j.expiresAt.toISOString(),
    })),
    nextCursor,
  })
}
