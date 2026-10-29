// Бал майстра: кого першим кличе розсилка і кого першим бачить клієнт.

import { effortTier } from '$lib/categories/effort'
import type { Crew } from '$lib/masters/meta'
import { DISPATCH_CONFIG } from '../config'
import type { Candidate, MasterSignals, ScoredCandidate } from '../types'

const { SCORE } = DISPATCH_CONFIG
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** Відзивчивість зі згладжуванням Лапласа: без історії — нейтральні 0.5. */
export function responseRate(notified: number, responded: number): number {
  return (responded + 1) / (notified + 2)
}

export function isNewMaster(
  m: Pick<MasterSignals, 'masterSince' | 'completedOrders'>,
  now: Date,
): boolean {
  const days = (now.getTime() - m.masterSince.getTime()) / DAY
  return (
    days < DISPATCH_CONFIG.NEW_MASTER_DAYS ||
    m.completedOrders < DISPATCH_CONFIG.NEW_MASTER_ORDERS
  )
}

/** Повний у своєму районі, лінійно до нуля на PROXIMITY_FADE_KM. */
export function proximityBonus(distanceKm: number | null | undefined): number {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return 0
  const share = 1 - distanceKm / DISPATCH_CONFIG.PROXIMITY_FADE_KM
  return SCORE.PROXIMITY * Math.min(1, Math.max(0, share))
}

/**
 * Відстань, з якою працюють кільця й близькість, — у часі дороги: майстер
 * з авто за два райони доїде не довше, ніж сусід маршруткою.
 */
export function travelDistance(
  m: Pick<MasterSignals, 'distanceKm' | 'travelKm'>,
): number | null {
  return m.travelKm !== undefined ? m.travelKm : m.distanceKm
}

/**
 * Зайнятому дорога дорожча: майстер із замовленнями на руках не встигне
 * через усе місто. Штраф росте з кількістю замовлень і відстанню в часі
 * дороги, тож авто його саме зменшує, без окремої гілки.
 */
export function busyTravelPenalty(
  activeOrders: number | null | undefined,
  travelKm: number | null,
): number {
  if (!activeOrders || travelKm === null || !Number.isFinite(travelKm)) return 0
  const load = Math.min(1, activeOrders / DISPATCH_CONFIG.MAX_ACTIVE_ORDERS)
  const far = Math.min(1, Math.max(0, travelKm / DISPATCH_CONFIG.BUSY_FAR_KM))
  return SCORE.BUSY_FAR_PENALTY * load * far
}

/**
 * Чи пасує формат роботи обсягу заявки: на дуже велике першими —
 * компанії й бригади, на невелике — ті, хто працює сам. Невідоме з будь-
 * якого боку (старий профіль, категорія без обсягу) — 0: за відсутність
 * даних не карамо й не нагороджуємо.
 */
export function crewFit(
  crew: Crew | null | undefined,
  effort: number | null | undefined,
): number {
  if (!crew || effort == null) return 0
  return DISPATCH_CONFIG.CREW_FIT[effortTier(effort)][crew]
}

/** Свіжість за lastSeen. Прапорцю isOnline не віримо: він не скидається. */
function freshness(lastSeen: Date | null | undefined, now: Date): number {
  const minutes = (now.getTime() - (lastSeen?.getTime() ?? 0)) / MINUTE
  if (minutes < 5) return SCORE.ONLINE
  if (minutes < 30) return SCORE.SEEN_5MIN
  if (minutes < 60) return SCORE.SEEN_1HOUR
  if (minutes < 24 * 60) return SCORE.SEEN_24HOUR
  return 0
}

/**
 * Якість майстра — спільна основа розсилки й рекомендацій: онлайн,
 * відзивчивість, рейтинг, верифікація, зайнятість, близькість, формат
 * роботи під обсяг заявки.
 */
export function masterScore(m: MasterSignals, now: Date): number {
  const travel = travelDistance(m)
  let score = freshness(m.lastSeen, now)
  score += (m.responseRate ?? 0.5) * SCORE.RESPONSIVENESS_MULTIPLIER
  score += (m.avgRating ?? 0) * SCORE.RATING_MULTIPLIER
  score += proximityBonus(travel)
  score += busyTravelPenalty(m.activeOrders, travel)
  if (m.isVerified) score += SCORE.VERIFIED
  score += m.crewFit ?? 0
  if ((m.activeOrders ?? 0) >= DISPATCH_CONFIG.MAX_ACTIVE_ORDERS) {
    score += SCORE.OVERLOADED_PENALTY
  }
  return score
}

/**
 * Бал у розсилці: якість, шанс новачку і штраф «його щойно вже кликали»,
 * який під лавиною заявок розкидає роботу рівно, а не на одних «зірок».
 */
export function dispatchScore(c: Candidate, now: Date): number {
  let score = masterScore(c, now)
  if (isNewMaster(c, now)) score += SCORE.NEW_MASTER_BOOST
  score -= (c.recentNotifications ?? 0) * SCORE.RECENT_LOAD_PENALTY
  return score
}

/** Кандидати від найкращого до найгіршого. */
export function rankCandidates(
  candidates: readonly Candidate[],
  now: Date,
): ScoredCandidate[] {
  return candidates
    .map((c) => ({
      id: c.id,
      score: dispatchScore(c, now),
      distanceKm: c.distanceKm ?? null,
      beyondReach: !c.withinReach,
    }))
    .sort((a, b) => b.score - a.score)
}
