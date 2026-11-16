import { prisma } from '$lib/server/prisma'
import { requireUser } from '$lib/server/guards'
import { redirect } from '@sveltejs/kit'
import { parseMasterSkills } from '$lib/masters/meta'
import { CATEGORY_SLUG } from '$lib/categories/cleaning/presets'
import { describeCleaningSkills } from '$lib/categories/cleaning/skills'
import { getCategories, getCities } from '$lib/server/reference'
import { nameBySlug } from '$lib/utils/slug-name'
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
  // * сесія вже в locals після hooks.server.ts — повторний getSession зайвий
  const sessionUser = requireUser(locals)

  // * явний select замість include: рядок User містить і aiProfile (JSON, росте
  // * разом з анкетою асистента), і банові поля — на сторінці профілю вони не
  // * потрібні, а тягнулись при кожному відкритті дашборда
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      name: true,
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
          crew: true,
          metadata: true,
        },
      },
    },
  })

  if (!user) redirect(302, '/user/login')

  if (user.role === 'CLIENT') {
    const [reviews, totalOrders, completedOrders, cities] = await Promise.all([
      loadReviews('clientId', user.id, 'MASTER_TO_CLIENT'),
      prisma.order.count({ where: { clientId: user.id } }),
      prisma.order.count({
        where: { clientId: user.id, status: 'COMPLETED' },
      }),
      getCities(),
    ])
    const cityName = nameBySlug(cities, user.city)

    return {
      profileType: 'client',
      isOwner: true,
      isAuthenticated: true,
      user: {
        id: user.id,
        name: user.name ?? '',
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

  const [reviews, cities, categories] = await Promise.all([
    loadReviews('masterId', user.id, 'CLIENT_TO_MASTER'),
    getCities(),
    getCategories(),
  ])
  const cityName = nameBySlug(cities, user.city)
  const categoryNames = (mp?.categories ?? []).map(
    (slug) => nameBySlug(categories, slug) ?? slug,
  )
  const skills = describeCleaningSkills(
    parseMasterSkills(mp?.metadata)[CATEGORY_SLUG],
  )

  return {
    profileType: 'master',
    isOwner: true,
    isAuthenticated: true,
    user: {
      id: user.id,
      name: user.name ?? '',
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
      crew: mp?.crew ?? null,
      services: skills.services,
      premises: skills.premises,
    },
  }
}
