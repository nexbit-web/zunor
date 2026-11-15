// Профіль клієнта — інструмент майстра: перш ніж відгукнутись чи вже в
// замовленні, подивитись, хто замовник і що про нього кажуть інші майстри.
// Один код для сторінки сайту (dashboard/client/[id]) і застосунку
// (GET /api/clients/[id]), щоб правила доступу не розійшлись.
//
// Публічної сторінки в клієнта немає навмисно (не «вітрина», MANIFESTO).
// Телефону тут немає навіть для майстра: він — лише в замовленні, після
// угоди (AGENTS.md, «Телефон — після угоди»).

import { prisma } from './prisma'
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

/**
 * Профіль клієнта `clientId` очима `viewerId`. null — не показувати: глядач
 * не майстер (клієнтові чужий профіль клієнта не потрібен), або такого
 * клієнта немає, або це не клієнт. Хто кличе — відповідає 404, а не 403:
 * відповідь не має підтверджувати, що профіль існує.
 *
 * Роль глядача — з бази, не з сесії: сесія з cookie-кешу може памʼятати
 * стару роль.
 */
export async function loadClientProfile(
  viewerId: string,
  clientId: string,
): Promise<ClientProfileData | null> {
  const viewer = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { role: true },
  })
  if (viewer?.role !== 'MASTER') return null

  const [client, reviews, totalOrders, completedOrders] = await Promise.all([
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
  ])

  if (!client || client.role !== 'CLIENT') return null

  // Назва міста українською (slug → name)
  const cityRow = client.city
    ? await prisma.city.findUnique({
        where: { slug: client.city },
        select: { name: true },
      })
    : null

  return {
    id: client.id,
    name: client.name ?? '',
    avatar: client.avatar ?? undefined,
    bio: client.bio ?? undefined,
    phone: null,
    city: cityRow?.name ?? client.city ?? undefined,
    createdAt: client.createdAt.toISOString(),
    totalOrders,
    completedOrders,
    avgRating: client.avgRatingAsClient,
    reviewsCount: client.reviewsCountAsClient,
    reviews,
  }
}
