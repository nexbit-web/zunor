import { error, redirect } from '@sveltejs/kit'
import { loadMasterPageById } from '$lib/server/master-page'
import { getCategories, getCities } from '$lib/server/reference'
import type { PageServerLoad } from './$types'
import type { FreelancerProfileData } from '$lib/components/profile/types'

// Профіль майстра — лише в дашборді: клієнт відкриває його з пропозиції,
// замовлення чи чату. Публічної сторінки немає — Zunor не каталог і не
// вітрина для пошуковиків, майстра підбирає платформа (MANIFESTO, «Профілі»).
// Дані — ті самі, що в GET /api/masters/[id] для застосунку
// ($lib/server/master-page, з Redis): без телефону й пошти.
export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
  // Як у профілі клієнта: гість не має дізнатись навіть те, що профіль
  // існує, тому 404, а не редірект на логін.
  const viewer = locals.user
  if (!viewer) throw error(404, 'Майстра не знайдено')

  // Свій профіль — на дашборді, там він із кнопкою «Редагувати».
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
    city: cities.find((c) => c.slug === page.city)?.name ?? page.city ?? undefined,
    createdAt: page.createdAt,
    verificationStatus: page.verificationStatus,
    verificationRejectReason: null,
    // Порядок — як у профілі майстра.
    categories: page.categories.map(
      (slug) => categories.find((c) => c.slug === slug)?.name ?? slug,
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
