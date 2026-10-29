// Спільний тип даних онбордингу (load віддає його обом компонентам).
import type { District } from '$lib/geo/districts'
import type { Crew } from '$lib/masters/meta'

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
  /** Своє авто; null — не відповідав. */
  hasVehicle?: boolean | null
  /** Формат роботи ($lib/masters/meta); null — не відповідав. */
  crew?: Crew | null
  companyName?: string | null
  /** Уміння в межах категорій: { skills } ($lib/masters/meta). */
  metadata?: unknown
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

/**
 * Етап онбордингу — кілька кроків під однією темою («Розкажіть про себе»).
 * Унизу смуга прогресу ділиться саме на етапи, а перед кожним стоїть
 * заставка: людина бачить не «крок 7 з 16», а «другий етап із трьох».
 */
export interface WizardPhase {
  id: string
  title: string
  /** Що буде на етапі й навіщо — під заголовком заставки. */
  lead: string
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
  /** Етап, до якого належить крок (WizardPhase.id). */
  phase?: string
  /**
   * step — питання; intro — заставка етапу; overview — огляд усіх етапів
   * на самому початку. Заставки нічого не питають і не перевіряються.
   */
  kind?: 'step' | 'intro' | 'overview'
}
