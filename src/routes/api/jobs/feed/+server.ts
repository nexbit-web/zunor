import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { clientRatingSelect, flattenClientRating } from '$lib/server/user-dto'
import { moneyParam } from '$lib/server/query'
import { getDistricts } from '$lib/server/reference'
import { cityDistricts, jobPlace } from '$lib/geo/districts'
import { masterFeedScope } from '$lib/server/dispatch'
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
      district: true,
      masterProfile: {
        select: {
          isActive: true,
          verificationStatus: true,
          categories: true,
          travelRadiusKm: true,
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

  // Відмови (чорна мітка), хвилі розсилки й межа виїзду — тим самим
  // правилом, що й перша сторінка з SSR: стрічка не обганяє розсилку.
  const allDistricts = await getDistricts()
  const scope = await masterFeedScope({
    masterId: userId,
    masterDistrict: user.district,
    travelRadiusKm: mp.travelRadiusKm,
    districts: cityDistricts(allDistricts, user.city),
  })
  const declinedJobIds = scope.declinedIds

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
      AND: [
        ...scope.where,
        ...(minPriceCents !== null
          ? [
              {
                OR: [
                  { budgetMaxCents: { gte: minPriceCents } },
                  { budgetMaxCents: null },
                ],
              },
            ]
          : []),
      ],
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
      district: true,
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
      // Той самий район і відстань, що в першій сторінці з SSR. Фільтр
      // ?cities= може дати заявку з чужого міста — тоді без відстані.
      place: jobPlace(
        cityDistricts(allDistricts, j.city),
        j.district,
        j.city === user.city ? user.district : null,
      ),
      createdAt: j.createdAt.toISOString(),
      expiresAt: j.expiresAt.toISOString(),
    })),
    nextCursor,
  })
}
