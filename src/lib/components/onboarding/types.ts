// Спільний тип даних онбордингу (load віддає його обом компонентам).
import type { District } from '$lib/geo/districts'

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
  /** Як далеко готовий їздити, км; null — будь-де. */
  travelRadiusKm: number | null
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
  /** Район міста (District.slug), null — не вказаний. */
  district: string | null
  bio: string | null
  role: string
  onboarded: boolean
  masterProfile: OnboardingMasterProfile | null
}

export interface OnboardingData {
  user: OnboardingUser
  categories: OnboardingCategory[]
  cities: OnboardingCity[]
  /** Райони всіх міст із БД; форма бере ті, що належать обраному місту. */
  districts: District[]
  prefill: {
    name: string
    phone: string
    citySlug: string
    avatar: string
    avatarPublicId: string
  }
}

/** Крок покрокового онбордингу (onboarding-wizard.svelte). */
export interface WizardStep {
  id: string
  /** Питання на весь екран: «Як вас звати?», а не «Ім'я». */
  title: string
  /** Навіщо ми це питаємо — одне речення під заголовком. */
  subtitle: string
  /** Крок можна пропустити: на ньому зʼявляється «Пропустити». */
  optional?: boolean
}
