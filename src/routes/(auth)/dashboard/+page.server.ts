import { prisma } from '$lib/server/prisma'
import { requireUser } from '$lib/server/guards'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import type {
  FreelancerProfileData,
  ClientProfileData,
  ProfileReview,
} from '$lib/components/profile/types'

type DashboardData =
  | {
      profileType: 'master'
      isOwner: true
      isAuthenticated: true
      user: FreelancerProfileData
    }
  | {
      profileType: 'client'
      isOwner: true
      isAuthenticated: true
      user: ClientProfileData
    }

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

export const load: PageServerLoad = async ({
  locals,
}): Promise<DashboardData> => {
  // Сесія вже в locals після hooks.server.ts — повторний getSession зайвий.
  const sessionUser = requireUser(locals)

  // Явний select замість include: рядок User містить і aiProfile (JSON, росте
  // разом з анкетою асистента), і банові поля — на сторінці профілю вони не
  // потрібні, а тягнулись при кожному відкритті дашборда.
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      name: true,
      username: true,
      avatar: true,
      bio: true,
      phone: true,
      role: true,
      city: true,
      createdAt: true,
      avgRatingAsMaster: true,
      reviewsCountAsMaster: true,
      avgRatingAsClient: true,
      reviewsCountAsClient: true,
      masterProfile: {
        select: {
          categories: true,
          portfolioImages: true,
          verificationStatus: true,
          verificationRejectReason: true,
          completedOrders: true,
        },
      },
    },
  })

  if (!user) redirect(302, '/user/login')

  if (user.role === 'CLIENT') {
    // Паралельно: відгуки + лічильники + назва міста
    const [reviews, totalOrders, completedOrders, cityRow] = await Promise.all([
      loadReviews('clientId', user.id, 'MASTER_TO_CLIENT'),
      prisma.order.count({ where: { clientId: user.id } }),
      prisma.order.count({
        where: { clientId: user.id, status: 'COMPLETED' },
      }),
      user.city
        ? prisma.city.findUnique({
            where: { slug: user.city },
            select: { name: true },
          })
        : Promise.resolve(null),
    ])
    const cityName = cityRow?.name ?? user.city ?? undefined

    return {
      profileType: 'client',
      isOwner: true,
      isAuthenticated: true,
      user: {
        id: user.id,
        name: user.name ?? '',
        username: user.username ?? undefined,
        avatar: user.avatar ?? undefined,
        bio: user.bio ?? undefined,
        phone: user.phone ?? undefined,
        city: cityName,
        createdAt: user.createdAt.toISOString(),
        totalOrders,
        completedOrders,
        avgRating: user.avgRatingAsClient,
        reviewsCount: user.reviewsCountAsClient,
        reviews,
      },
    }
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
  const categoryNames = (mp?.categories ?? []).map(
    (slug) => categoryRows.find((c) => c.slug === slug)?.name ?? slug,
  )

  return {
    profileType: 'master',
    isOwner: true,
    isAuthenticated: true,
    user: {
      id: user.id,
      name: user.name ?? '',
      username: user.username ?? undefined,
      avatar: user.avatar ?? undefined,
      bio: user.bio ?? undefined,
      city: cityName,
      createdAt: user.createdAt.toISOString(),
      verificationStatus: mp?.verificationStatus ?? 'NONE',
      verificationRejectReason: mp?.verificationRejectReason ?? null,
      categories: categoryNames,
      categorySlugs: mp?.categories ?? [],
      portfolioImages: mp?.portfolioImages ?? [],
      avgRating: user.avgRatingAsMaster,
      reviewsCount: user.reviewsCountAsMaster,
      completedOrders: mp?.completedOrders ?? 0,
      reviews,
    },
  }
}
