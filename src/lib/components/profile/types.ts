// src/lib/components/profile/types.ts

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
  city?: string | null
  createdAt: string | Date

  verificationStatus: VerificationStatus
  verificationRejectReason?: string | null

  categories: string[]

  avgRating: number
  reviewsCount: number
  completedOrders: number

  reviews: ProfileReview[]
}

export interface ClientProfileData {
  id: string
  name: string
  username?: string
  avatar?: string | null
  bio?: string | null
  city?: string | null
  createdAt: string | Date
  totalOrders: number
  completedOrders: number
  avgRating: number
  reviewsCount: number
  reviews: ProfileReview[]
}
