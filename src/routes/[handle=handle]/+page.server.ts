import { error, redirect } from '@sveltejs/kit'
import { loadMasterPage } from '$lib/server/master-page'
import { getCategories, getCities } from '$lib/server/reference'
import type { PageServerLoad } from './$types'
import type { FreelancerProfileData } from '$lib/components/profile/types'

const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/

// Сторінку читають і пошукові боти, тож у штатному випадку тут немає
// жодного запиту до бази: майстер — з Redis (master-page.ts), назви міста й
// послуг — з кешу довідників.
export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
  const raw = params.handle.startsWith('@')
    ? params.handle.slice(1)
    : params.handle
  const username = raw.trim().toLowerCase()

  if (!USERNAME_RE.test(username)) {
    throw error(404, 'Користувача не знайдено')
  }

  const [page, cities, categories] = await Promise.all([
    loadMasterPage(username),
    getCities(),
    getCategories(),
  ])
  if (!page) throw error(404, 'Користувача не знайдено')

  // Сторінка публічна: сесія тут не обовʼязкова, лише впливає на вигляд.
  const session = locals.session
  if (session && page.id === session.user.id) {
    throw redirect(302, '/dashboard')
  }

  // Клієнт не має публічної сторінки /@handle — лише майстри є вітринами.
  // Перегляд клієнта майстром відбувається через /client/[id].
  if (page.role === 'CLIENT') {
    throw error(404, 'Користувача не знайдено')
  }

  if (page.verificationStatus === 'VERIFIED') {
    setHeaders({
      'cache-control':
        'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
    })
  } else {
    setHeaders({
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex, nofollow',
    })
  }

  const cityName = cities.find((c) => c.slug === page.city)?.name
  const masterUser: FreelancerProfileData = {
    id: page.id,
    name: page.name ?? '',
    username: page.username,
    avatar: page.avatar ?? undefined,
    bio: page.bio ?? undefined,
    city: cityName ?? page.city ?? undefined,
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
  }

  return {
    profileType: 'master' as const,
    isOwner: false as const,
    isAuthenticated: !!session,
    user: masterUser,
  }
}
