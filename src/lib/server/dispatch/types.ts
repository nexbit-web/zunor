// src/lib/server/dispatch/types.ts
//
// Типи "мозку-диспетчера". Чисті дані, без залежностей.

/** Кандидат на уведомлення — майстер з усім, що потрібно для scoring. */
export interface Candidate {
  id: string
  isOnline: boolean
  lastSeen: Date
  avgRating: number
  isVerified: boolean
  activeOrders: number
  /** Коли майстер створив профіль — для boost новачка. */
  masterSince: Date
  completedOrders: number
}

/** Контекст заявки на момент прийняття рішення. */
export interface JobContext {
  jobId: string
  proposalsCount: number
  createdAt: Date
  /** ID майстрів, яких вже уведомили (щоб не дублювати). */
  alreadyNotified: Set<string>
}

/** Рішення мозку: кого уведомити в цій хвилі. */
export interface DispatchDecision {
  /** Чи треба взагалі щось робити. */
  shouldDispatch: boolean
  /** Причина зупинки (для логів), якщо shouldDispatch = false. */
  stopReason?: 'enough-proposals' | 'job-closed' | 'no-candidates'
  /** Номер поточної хвилі. */
  wave: number
  /** Кандидати для уведомлення в цій хвилі (вже відсортовані, обрізані). */
  toNotify: ScoredCandidate[]
}

/** Кандидат з порахованим score. */
export interface ScoredCandidate {
  id: string
  score: number
}

/** Конфіг мозку — всі магічні числа в одному місці. */
export const DISPATCH_CONFIG = {
  /** Досить відгуків — припиняємо розсилку. */
  ENOUGH_PROPOSALS: 5,

  /** Перевантажений майстер (активних замовлень). */
  MAX_ACTIVE_ORDERS: 3,

  /** Boost новачка: скільки днів від реєстрації профілю. */
  NEW_MASTER_DAYS: 14,
  /** Boost новачка: до скількох виконаних замовлень. */
  NEW_MASTER_ORDERS: 5,

  /** Розміри хвиль (скільки майстрів уведомити). */
  WAVES: [
    { afterMinutes: 0, batchSize: 20 }, // хвиля 1 — одразу
    { afterMinutes: 2, batchSize: 30 }, // хвиля 2 — через 2 хв
    { afterMinutes: 10, batchSize: 9999 }, // хвиля 3 — всі решта
  ],

  /** Бали scoring. */
  SCORE: {
    ONLINE: 1000,
    SEEN_5MIN: 500,
    SEEN_1HOUR: 300,
    SEEN_24HOUR: 100,
    RATING_MULTIPLIER: 50, // avgRating (0-5) × 50
    VERIFIED: 150,
    NEW_MASTER_BOOST: 400, // boost новачкам, щоб мали шанс
    OVERLOADED_PENALTY: -800,
  },
} as const
