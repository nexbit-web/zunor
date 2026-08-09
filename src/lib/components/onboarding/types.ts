// Спільний тип даних онбордингу (load віддає його обом компонентам).
export interface OnboardingCity {
  slug: string
  name: string
  region?: string | null
  isCapital?: boolean
}

export interface OnboardingCategory {
  slug: string
  name: string
  icon?: string | null
}

export interface OnboardingMasterProfile {
  categories: string[]
  description: string | null
  portfolioImages: string[]
  portfolioImagesPublicIds: string[]
  verificationStatus: string
  verificationRejectReason: string | null
}

export interface OnboardingUser {
  id: string
  email: string
  name: string | null
  username: string | null
  phone: string | null
  avatar: string | null
  avatarPublicId: string | null
  city: string | null
  bio: string | null
  role: string
  onboarded: boolean
  masterProfile: OnboardingMasterProfile | null
}

export interface OnboardingData {
  user: OnboardingUser
  categories: OnboardingCategory[]
  cities: OnboardingCity[]
  prefill: {
    name: string
    phone: string
    citySlug: string
    avatar: string
    avatarPublicId: string
  }
}
