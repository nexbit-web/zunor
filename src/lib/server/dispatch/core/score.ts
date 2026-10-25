// Бал майстра: кого першим кличе розсилка і кого першим бачить клієнт.

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
 * відзивчивість, рейтинг, верифікація, зайнятість, близькість.
 */
export function masterScore(m: MasterSignals, now: Date): number {
  let score = freshness(m.lastSeen, now)
  score += (m.responseRate ?? 0.5) * SCORE.RESPONSIVENESS_MULTIPLIER
  score += (m.avgRating ?? 0) * SCORE.RATING_MULTIPLIER
  score += proximityBonus(m.distanceKm)
  if (m.isVerified) score += SCORE.VERIFIED
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
