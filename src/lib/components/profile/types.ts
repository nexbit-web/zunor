// src/lib/components/profile/types.ts

import type { Crew } from '$lib/masters/meta'
import type { SkillLabel } from '$lib/categories/cleaning/skills'

export type VerificationStatus = 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED'

export interface ProfileReview {
  id: string
  authorName: string
  authorInitials: string
  rating: number
  text: string
  createdAt: string | Date
}

export interface FreelancerProfileData {
  id: string
  name: string
  username?: string
  avatar?: string | null
  bio?: string | null
  phone?: string | null
  city?: string | null
  createdAt: string | Date

  verificationStatus: VerificationStatus
  verificationRejectReason?: string | null

  categories: string[]
  categorySlugs: string[]
  portfolioImages: string[]
  avgRating: number
  reviewsCount: number
  completedOrders: number

  reviews: ProfileReview[]

  /**
   * Формат роботи: компанія (COMPANY) чи людина — сама або з напарником.
   * null/відсутнє — профіль старший за питання, сторінка мовчить.
   */
  crew?: Crew | null
  /** Які прибирання робить — з анкети майстра. */
  services?: SkillLabel[]
  /** Де прибирає: житло, офіси. */
  premises?: SkillLabel[]
}

export interface ClientProfileData {
  id: string
  name: string
  username?: string
  avatar?: string | null
  bio?: string | null
  phone?: string | null
  city?: string | null
  createdAt: string | Date
  totalOrders: number
  completedOrders: number
  avgRating: number
  reviewsCount: number
  reviews: ProfileReview[]
}
