// * профіль клієнта — інструмент майстра; один код для сайту й застосунку.
// * Телефону тут немає: він — лише в замовленні, після угоди

import { prisma } from './prisma'
import { getCities } from './reference'
import { nameBySlug } from '$lib/utils/slug-name'
import type {
  ClientProfileData,
  ProfileReview,
} from '$lib/components/profile/types'

const REVIEWS_SHOWN = 30

async function loadClientReviews(clientId: string): Promise<ProfileReview[]> {
  const reviews = await prisma.review.findMany({
    where: { direction: 'MASTER_TO_CLIENT', order: { clientId } },
    orderBy: { createdAt: 'desc' },
    take: REVIEWS_SHOWN,
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

// * null — не показувати: глядач не майстер або це не клієнт (назовні 404).
// * Роль глядача — з бази: сесія з cookie-кешу може памʼятати стару
export async function loadClientProfile(
  viewerId: string,
  clientId: string,
): Promise<ClientProfileData | null> {
  const viewer = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { role: true },
  })
  if (viewer?.role !== 'MASTER') return null

  const [client, reviews, totalOrders, completedOrders, cities] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          role: true,
          name: true,
          avatar: true,
          bio: true,
          city: true,
          createdAt: true,
          avgRatingAsClient: true,
          reviewsCountAsClient: true,
        },
      }),
      loadClientReviews(clientId),
      prisma.order.count({ where: { clientId } }),
      prisma.order.count({
        where: { clientId, status: 'COMPLETED' },
      }),
      getCities(),
    ])

  if (!client || client.role !== 'CLIENT') return null

  return {
    id: client.id,
    name: client.name ?? '',
    avatar: client.avatar ?? undefined,
    bio: client.bio ?? undefined,
    phone: null,
    city: nameBySlug(cities, client.city),
    createdAt: client.createdAt.toISOString(),
    totalOrders,
    completedOrders,
    avgRating: client.avgRatingAsClient,
    reviewsCount: client.reviewsCountAsClient,
    reviews,
  }
}
