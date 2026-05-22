// src/lib/server/dispatch/scoring.ts
//
// Чиста логіка scoring. Жодних залежностей (БД, Pusher).
// Майстер + контекст → число. Легко тестувати, легко замінити на ML потім.

import type { Candidate, ScoredCandidate, JobContext } from './types'
import { DISPATCH_CONFIG } from './types'

const { SCORE } = DISPATCH_CONFIG

/**
 * Рахує score одного кандидата.
 * Вищий score = вищий пріоритет уведомлення.
 *
 * Маніфест:
 *   - онлайн та активні — першими (швидкість)
 *   - високий рейтинг — пріоритет (якість)
 *   - не перевантажені — пріоритет (справедливість, баланс)
 *   - новачки отримують boost — щоб мали шанс (справедливість)
 */
export function scoreCandidate(c: Candidate, now: Date): number {
  let score = 0

  // ─── Швидкість: онлайн та нещодавня активність ───
  if (c.isOnline) {
    score += SCORE.ONLINE
  } else {
    const minsSinceSeen = (now.getTime() - c.lastSeen.getTime()) / 60000
    if (minsSinceSeen < 5) score += SCORE.SEEN_5MIN
    else if (minsSinceSeen < 60) score += SCORE.SEEN_1HOUR
    else if (minsSinceSeen < 60 * 24) score += SCORE.SEEN_24HOUR
  }

  // ─── Якість: рейтинг ───
  score += c.avgRating * SCORE.RATING_MULTIPLIER

  // ─── Довіра: верифікація (бонус, не фільтр) ───
  if (c.isVerified) score += SCORE.VERIFIED

  // ─── Справедливість: boost новачкам ───
  // Новачок = молодий профіль АБО мало виконаних замовлень.
  // Даємо boost, щоб він потрапляв у ранні хвилі й мав шанс відгукнутися першим.
  if (isNewMaster(c, now)) {
    score += SCORE.NEW_MASTER_BOOST
  }

  // ─── Баланс: штраф перевантаженим ───
  if (c.activeOrders >= DISPATCH_CONFIG.MAX_ACTIVE_ORDERS) {
    score += SCORE.OVERLOADED_PENALTY
  }

  return score
}

/** Чи є майстер новачком (для boost). */
export function isNewMaster(c: Candidate, now: Date): boolean {
  const daysSinceStart =
    (now.getTime() - c.masterSince.getTime()) / (1000 * 60 * 60 * 24)
  return (
    daysSinceStart < DISPATCH_CONFIG.NEW_MASTER_DAYS ||
    c.completedOrders < DISPATCH_CONFIG.NEW_MASTER_ORDERS
  )
}

/**
 * Рахує score для всіх кандидатів і сортує (вищий — першим).
 */
export function scoreAll(
  candidates: Candidate[],
  now: Date = new Date(),
): ScoredCandidate[] {
  return candidates
    .map((c) => ({ id: c.id, score: scoreCandidate(c, now) }))
    .sort((a, b) => b.score - a.score)
}
