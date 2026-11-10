// Типи мозку підбору — лише дані, без логіки.

import type { JobStatus } from '../../../generated/prisma/client'

/** Усе, з чого складається бал майстра. */
export interface MasterSignals {
  readonly lastSeen: Date
  readonly avgRating: number
  readonly isVerified: boolean
  readonly activeOrders: number
  /** Коли створено профіль майстра. */
  readonly masterSince: Date
  readonly completedOrders: number
  /** Згладжена частка заявок, на які майстер відгукнувся, 0–1. */
  readonly responseRate: number
  /** Від району майстра до району заявки, км; null — невідомо. */
  readonly distanceKm: number | null
  /**
   * Та сама відстань у часі дороги: з авто — коротша
   * (VEHICLE_DISTANCE_FACTOR). Не задано — дорівнює distanceKm.
   */
  readonly travelKm?: number | null
  /**
   * Наскільки формат роботи майстра пасує обсягу заявки — готовий бал із
   * crewFit (core/score.ts): бригада на будинок вище, компанія на кухню
   * нижче. Не задано — 0.
   */
  readonly crewFit?: number
}

/** Майстер, якого можна покликати в хвилю. */
export interface Candidate extends MasterSignals {
  readonly id: string
  /** Скільки заявок йому слали за RECENT_LOAD_WINDOW_MIN. */
  readonly recentNotifications: number
  /**
   * Заявка йому під силу без застережень: у межах його радіуса виїзду і
   * нічого не бракує (авто, коли сміття треба вивезти). Ні — кличе лише
   * останній дзвінок, коли майстрів замало.
   */
  readonly withinReach: boolean
}

export interface ScoredCandidate {
  readonly id: string
  readonly score: number
  readonly distanceKm: number | null
  /**
   * Кличемо з-за його межі виїзду (останній дзвінок). Сповіщення — не «нова
   * заявка», а пропозиція, і мовчання на неї не знижує відзивчивість.
   */
  readonly beyondReach: boolean
}

/** Заявка на момент рішення. */
export interface JobSnapshot {
  readonly id: string
  readonly title: string
  readonly category: string
  readonly city: string
  /** Район із довідника; null — невідомий, і тоді кілець немає. */
  readonly district: string | null
  readonly clientId: string
  readonly status: JobStatus
  readonly proposalsCount: number
  readonly createdAt: Date
  /** Job.metadata: з неї категорія каже, кому заявка підходить. */
  readonly metadata: unknown
  /**
   * Обсяг 1–10: Job.effort, а для заявок, старших за поле, — порахований
   * з metadata категорією. null — категорія обсягу не рахує.
   */
  readonly effort: number | null
  /** Остання відпрацьована хвиля; 0 — ще жодної. */
  readonly dispatchWave: number
  /** Кого по цій заявці вже покликали. */
  readonly notified: ReadonlySet<string>
}

/** Достатньо, щоб планувати хвилі заявки. */
export interface JobRef {
  readonly id: string
  readonly createdAt: Date
}

export type StopReason = 'job-closed' | 'enough-proposals'

export interface StopPlan {
  readonly kind: 'stop'
  readonly reason: StopReason
}

/** Рішення хвилі. Порожній toNotify — хвиля відпрацювала, кликати нікого. */
export interface WavePlan {
  readonly kind: 'wave'
  readonly wave: number
  readonly jobTitle: string
  /** До якого радіуса дійшла хвиля, км; null — усе місто. */
  readonly radiusKm: number | null
  /** Покликала й тих, кому за межею виїзду: остання хвиля, а майстрів мало. */
  readonly lastCall: boolean
  readonly toNotify: readonly ScoredCandidate[]
}

export type DispatchDecision = WavePlan | StopPlan

export type DispatchResult =
  | StopPlan
  | {
      readonly kind: 'wave'
      readonly wave: number
      readonly notified: number
      readonly lastCall: boolean
    }

/** Що зробило одне відновлення розсилки. */
export interface ResumeReport {
  /** Скільки незавершених заявок переглянуто. */
  readonly checked: number
  /** Скільком запущено хвилю, яку таймер не встиг. */
  readonly caughtUp: number
}

/** Відгук на заявку — для рекомендацій клієнту. */
export interface RankableProposal {
  readonly id: string
  readonly createdAt: Date
  readonly master: MasterSignals
}

export interface Recommendation {
  /** Топ, який клієнт бачить першим. */
  readonly recommended: ReadonlySet<string>
  /** Новачки — для мітки «✨ Новачок». */
  readonly newbies: ReadonlySet<string>
}
