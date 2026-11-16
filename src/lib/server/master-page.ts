// * профіль майстра очима клієнта — для сайту й застосунку, з кешу Redis:
// * його відкривають із кожної пропозиції. Ключ — за userId

import { prisma } from './prisma'
import { cached, forget } from './cache'
import { parseMasterSkills } from '$lib/masters/meta'
import { CATEGORY_SLUG } from '$lib/categories/cleaning/presets'
import {
  describeCleaningSkills,
  type SkillLabel,
} from '$lib/categories/cleaning/skills'
import type { ProfileReview } from '$lib/components/profile/types'
import type {
  CrewType,
  Role,
  VerificationStatus,
} from '../../generated/prisma/client'

/** Відгуки, рейтинг і лічильники оновлюються не миттєво — у межах цього. */
const PAGE_TTL_SEC = 10 * 60
const REVIEWS_SHOWN = 30

/** Відгук для сторінки; дата — рядком ISO, бо значення живе в Redis. */
type PageReview = Omit<ProfileReview, 'createdAt'> & { createdAt: string }

export interface MasterPage {
  id: string
  role: Role
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
  // * необовʼязкові: запис у Redis, зроблений до цих полів, ще живе
  crew?: CrewType | null
  services?: SkillLabel[]
  premises?: SkillLabel[]
}

/** Профіль за id; роль перевіряє той, хто кличе. Порожнє не кешуємо. */
export function loadMasterPageById(userId: string): Promise<MasterPage | null> {
  return cached(`master:${userId}`, PAGE_TTL_SEC, () => readPage(userId), {
    cacheNull: false,
  })
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
            crew: true,
            metadata: true,
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
  if (!user) return null

  const mp = user.masterProfile
  const skills = describeCleaningSkills(
    parseMasterSkills(mp?.metadata)[CATEGORY_SLUG],
  )
  return {
    id: user.id,
    role: user.role,
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
    crew: mp?.crew ?? null,
    services: skills.services,
    premises: skills.premises,
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
