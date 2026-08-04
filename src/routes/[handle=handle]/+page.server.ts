import { auth } from '$lib/server/auth'
import { prisma } from '$lib/server/prisma'
import { error, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import type {
  FreelancerProfileData,
  ProfileReview,
} from '$lib/components/profile/types'

const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/

async function loadReviews(
  userIdField: 'masterId' | 'clientId',
  userId: string,
  direction: 'CLIENT_TO_MASTER' | 'MASTER_TO_CLIENT',
): Promise<ProfileReview[]> {
  const reviews = await prisma.review.findMany({
    where: {
      direction,
      order: { [userIdField]: userId },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { author: { select: { id: true, name: true } } },
  })

  return reviews.map((r) => {
    const name = r.author.name ?? 'Користувач'
    return {
      id: r.id,
      authorName: name,
      authorInitials: name[0]?.toUpperCase() ?? '?',
      rating: r.rating,
      text: r.comment ?? '',
      createdAt: r.createdAt.toISOString(),
    }
  })
}

export const load: PageServerLoad = async ({ params, request, setHeaders }) => {
  const raw = params.handle.startsWith('@')
    ? params.handle.slice(1)
    : params.handle
  const username = raw.trim().toLowerCase()

  if (!USERNAME_RE.test(username)) {
    throw error(404, 'Користувача не знайдено')
  }

  const [session, user] = await Promise.all([
    auth.api.getSession({ headers: request.headers }),
    prisma.user.findUnique({
      where: { username },
      include: { masterProfile: true },
    }),
  ])

  const isAuthenticated = !!session
  if (!user) throw error(404, 'Користувача не знайдено')

  if (session && user.id === session.user.id) {
    throw redirect(302, '/dashboard')
  }

  // Клієнт не має публічної сторінки /@handle — лише майстри є вітринами.
  // Перегляд клієнта майстром відбувається через /client/[id].
  if (user.role === 'CLIENT') {
    throw error(404, 'Користувача не знайдено')
  }

  const mp = user.masterProfile

  // Паралельно: відгуки + назва міста + назви категорій
  const [reviews, cityRow, categoryRows] = await Promise.all([
    loadReviews('masterId', user.id, 'CLIENT_TO_MASTER'),
    user.city
      ? prisma.city.findUnique({
          where: { slug: user.city },
          select: { name: true },
        })
      : Promise.resolve(null),
    mp?.categories && mp.categories.length > 0
      ? prisma.category.findMany({
          where: { slug: { in: mp.categories } },
          select: { slug: true, name: true },
        })
      : Promise.resolve([]),
  ])
  const cityName = cityRow?.name ?? user.city ?? undefined
  // Зберігаємо порядок як у профілі
  const categoryNames = (mp?.categories ?? []).map(
    (slug) => categoryRows.find((c) => c.slug === slug)?.name ?? slug,
  )

  if (mp?.verificationStatus === 'VERIFIED') {
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

  const masterUser: FreelancerProfileData = {
    id: user.id,
    name: user.name ?? '',
    username: user.username ?? undefined,
    avatar: user.avatar ?? undefined,
    bio: user.bio ?? undefined,
    city: cityName,
    createdAt: user.createdAt.toISOString(),
    verificationStatus: mp?.verificationStatus ?? 'NONE',
    verificationRejectReason: null,
    categories: categoryNames,
    categorySlugs: mp?.categories ?? [],
    portfolioImages: mp?.portfolioImages ?? [],
    avgRating: user.avgRatingAsMaster,
    reviewsCount: user.reviewsCountAsMaster,
    completedOrders: mp?.completedOrders ?? 0,
    reviews,
  }

  return {
    profileType: 'master' as const,
    isOwner: false as const,
    isAuthenticated,
    user: masterUser,
  }
}
