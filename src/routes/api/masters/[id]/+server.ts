import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { loadMasterPageById } from '$lib/server/master-page'
import { getCategories, getCities } from '$lib/server/reference'
import type { RequestHandler } from './$types'

/**
 * GET /api/masters/[id] — профіль майстра для застосунку: клієнт відкриває
 * його з пропозиції чи замовлення (фото, перевірка, рейтинг, виконані,
 * послуги, «про себе», приклади робіт, відгуки).
 *
 * Дані — ті самі, що на публічній сторінці /@handle ($lib/server/master-page,
 * з Redis), тож нічого понад неї тут немає: ні телефону, ні пошти. Сторінка
 * публічна, але застосунок — лише з акаунтом. Не майстер (чи немає такого)
 * — 404.
 *
 * Каталогу за цим немає (MANIFESTO): шляху «усі майстри» не існує — сюди
 * приходять лише з конкретної пропозиції чи замовлення.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  requireApiUser(locals)

  const page = await loadMasterPageById(params.id)
  if (!page || page.role !== 'MASTER') throw error(404, 'Майстра не знайдено')

  const [cities, categories] = await Promise.all([getCities(), getCategories()])

  return json({
    profile: {
      id: page.id,
      name: page.name,
      username: page.username,
      avatar: page.avatar,
      bio: page.bio,
      city: cities.find((c) => c.slug === page.city)?.name ?? page.city,
      createdAt: page.createdAt,
      isVerified: page.verificationStatus === 'VERIFIED',
      crew: page.crew ?? null,
      // Порядок — як у профілі майстра.
      categories: page.categories.map(
        (slug) => categories.find((c) => c.slug === slug)?.name ?? slug,
      ),
      // Ті самі slug'и — за ними застосунок бере банер шапки, як сайт
      // ($lib/categories/registry: getBannerForCategories).
      categorySlugs: page.categories,
      services: page.services ?? [],
      premises: page.premises ?? [],
      portfolioImages: page.portfolioImages,
      avgRating: page.avgRating,
      reviewsCount: page.reviewsCount,
      completedOrders: page.completedOrders,
      reviews: page.reviews,
    },
  })
}
