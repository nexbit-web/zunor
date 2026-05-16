import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
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
  request,
}): Promise<DashboardData> => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw redirect(302, '/user/login')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      masterProfile: true,
    },
  })

  if (!user) throw redirect(302, '/user/login')

  console.log('[dashboard] role=', user.role, 'userId=', user.id)

  if (user.role === 'CLIENT') {
    const reviews = await loadReviews('clientId', user.id, 'MASTER_TO_CLIENT')
    const [totalOrders, completedOrders] = await Promise.all([
      prisma.order.count({ where: { clientId: user.id } }),
      prisma.order.count({
        where: { clientId: user.id, status: 'COMPLETED' },
      }),
    ])

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
        city: user.city ?? undefined,
        createdAt: user.createdAt.toISOString(),
        totalOrders,
        completedOrders,
        avgRating: user.avgRating,
        reviewsCount: user.reviewsCount,
        reviews,
      },
    }
  }

  const mp = user.masterProfile
  const reviews = await loadReviews('masterId', user.id, 'CLIENT_TO_MASTER')

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
      city: user.city ?? undefined,
      createdAt: user.createdAt.toISOString(),
      verificationStatus: mp?.verificationStatus ?? 'NONE',
      verificationRejectReason: mp?.verificationRejectReason ?? null,
      categories: mp?.categories ?? [],
      avgRating: user.avgRating,
      reviewsCount: user.reviewsCount,
      completedOrders: mp?.completedOrders ?? 0,
      reviews,
    },
  }
}
