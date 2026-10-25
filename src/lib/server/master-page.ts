// Публічна сторінка майстра (/@handle). Її читають і люди, і пошукові
// боти — у будь-яку годину, тож дані беруться з Redis, а не будять Neon.
//
// Ключі за userId, а не за username: кожне місце, що міняє профіль, знає
// id і скидає кеш одним викликом. Username → id — окремий ключ; якщо
// username змінили, дані під ним уже з іншим username, і сторінка за
// старим посиланням зникає одразу, без очікування TTL.

import { prisma } from './prisma'
import { cached, forget } from './cache'
import type { ProfileReview } from '$lib/components/profile/types'
import type { Role, VerificationStatus } from '../../generated/prisma/client'

/** Відгуки, рейтинг і лічильники оновлюються не миттєво — у межах цього. */
const PAGE_TTL_SEC = 10 * 60
const HANDLE_TTL_SEC = 60 * 60
const REVIEWS_SHOWN = 30

/** Відгук для сторінки; дата — рядком ISO, бо значення живе в Redis. */
type PageReview = Omit<ProfileReview, 'createdAt'> & { createdAt: string }

export interface MasterPage {
  id: string
  role: Role
  username: string
  name: string | null
  avatar: string | null
  bio: string | null
  city: string | null
  createdAt: string
  verificationStatus: VerificationStatus
  categories: string[]
  portfolioImages: string[]
  avgRating: number
  reviewsCount: number
  completedOrders: number
  reviews: PageReview[]
}

/** null — такого майстра немає (або username уже інший). */
export async function loadMasterPage(
  username: string,
): Promise<MasterPage | null> {
  const userId = await cached(
    `handle:${username}`,
    HANDLE_TTL_SEC,
    async () =>
      (
        await prisma.user.findUnique({
          where: { username },
          select: { id: true },
        })
      )?.id ?? null,
    { cacheNull: false },
  )
  if (!userId) return null

  const page = await cached(`master:${userId}`, PAGE_TTL_SEC, () =>
    readPage(userId),
  )
  if (page?.username === username) return page

  await forget(`handle:${username}`)
  return null
}

/** Профіль, портфоліо чи відгуки змінились — сторінку перечитати. */
export function forgetMasterPage(userId: string): Promise<void> {
  return forget(`master:${userId}`)
}

async function readPage(userId: string): Promise<MasterPage | null> {
  const [user, reviews] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        username: true,
        name: true,
        avatar: true,
        bio: true,
        city: true,
        createdAt: true,
        avgRatingAsMaster: true,
        reviewsCountAsMaster: true,
        masterProfile: {
          select: {
            verificationStatus: true,
            categories: true,
            portfolioImages: true,
            completedOrders: true,
          },
        },
      },
    }),
    prisma.review.findMany({
      where: { direction: 'CLIENT_TO_MASTER', order: { masterId: userId } },
      orderBy: { createdAt: 'desc' },
      take: REVIEWS_SHOWN,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        author: { select: { name: true } },
      },
    }),
  ])
  if (!user?.username) return null

  const mp = user.masterProfile
  return {
    id: user.id,
    role: user.role,
    username: user.username,
    name: user.name,
    avatar: user.avatar,
    bio: user.bio,
    city: user.city,
    createdAt: user.createdAt.toISOString(),
    verificationStatus: mp?.verificationStatus ?? 'NONE',
    categories: mp?.categories ?? [],
    portfolioImages: mp?.portfolioImages ?? [],
    avgRating: user.avgRatingAsMaster,
    reviewsCount: user.reviewsCountAsMaster,
    completedOrders: mp?.completedOrders ?? 0,
    reviews: reviews.map((r) => {
      const name = r.author.name ?? 'Користувач'
      return {
        id: r.id,
        authorName: name,
        authorInitials: name[0]?.toUpperCase() ?? '?',
        rating: r.rating,
        text: r.comment ?? '',
        createdAt: r.createdAt.toISOString(),
      }
    }),
  }
}
