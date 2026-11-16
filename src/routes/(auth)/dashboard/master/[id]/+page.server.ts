import { error, redirect } from '@sveltejs/kit'
import { loadMasterPageById } from '$lib/server/master-page'
import { getCategories, getCities } from '$lib/server/reference'
import { nameBySlug } from '$lib/utils/slug-name'
import type { PageServerLoad } from './$types'
import type { FreelancerProfileData } from '$lib/components/profile/types'

// * профіль майстра — лише в дашборді, публічної сторінки немає. Дані ті
// * самі, що в GET /api/masters/[id]: без телефону й пошти
export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
  // * як у профілі клієнта: гість не має дізнатись навіть те, що профіль
  // * існує, тому 404, а не редірект на логін
  const viewer = locals.user
  if (!viewer) throw error(404, 'Майстра не знайдено')

  // * свій профіль — на дашборді, там він із кнопкою «Редагувати»
  if (params.id === viewer.id) throw redirect(302, '/dashboard')

  const [page, cities, categories] = await Promise.all([
    loadMasterPageById(params.id),
    getCities(),
    getCategories(),
  ])
  if (!page || page.role !== 'MASTER') throw error(404, 'Майстра не знайдено')

  setHeaders({
    'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex, nofollow',
  })

  const user: FreelancerProfileData = {
    id: page.id,
    name: page.name ?? '',
    avatar: page.avatar ?? undefined,
    bio: page.bio ?? undefined,
    city: nameBySlug(cities, page.city),
    createdAt: page.createdAt,
    verificationStatus: page.verificationStatus,
    verificationRejectReason: null,
    // * порядок — як у профілі майстра
    categories: page.categories.map(
      (slug) => nameBySlug(categories, slug) ?? slug,
    ),
    categorySlugs: page.categories,
    portfolioImages: page.portfolioImages,
    avgRating: page.avgRating,
    reviewsCount: page.reviewsCount,
    completedOrders: page.completedOrders,
    reviews: page.reviews,
    crew: page.crew ?? null,
    services: page.services ?? [],
    premises: page.premises ?? [],
  }

  return { user }
}
