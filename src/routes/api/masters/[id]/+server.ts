import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { loadMasterPageById } from '$lib/server/master-page'
import { getCategories, getCities } from '$lib/server/reference'
import { nameBySlug } from '$lib/utils/slug-name'
import type { RequestHandler } from './$types'

/**
 * GET /api/masters/[id] — профіль майстра для застосунку: ті самі дані, що
 * на сторінці сайту, без телефону й пошти. Шляху «усі майстри» немає.
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
      avatar: page.avatar,
      bio: page.bio,
      city: nameBySlug(cities, page.city) ?? page.city,
      createdAt: page.createdAt,
      isVerified: page.verificationStatus === 'VERIFIED',
      crew: page.crew ?? null,
      // * порядок — як у профілі майстра
      categories: page.categories.map(
        (slug) => nameBySlug(categories, slug) ?? slug,
      ),
      // * ті самі slug'и — за ними застосунок бере банер шапки, як сайт
      // * ($lib/categories/registry: getBannerForCategories)
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
