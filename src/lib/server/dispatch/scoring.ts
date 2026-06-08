// src/lib/server/dispatch/scoring.ts
//
// Чиста логіка scoring. Жодних залежностей (БД, Pusher).
// Майстер + контекст → число. Легко тестувати, легко замінити на ML потім.

import type { Candidate, ScoredCandidate } from './types'
import { DISPATCH_CONFIG } from './types'

const { SCORE } = DISPATCH_CONFIG

/**
 * Рахує score одного кандидата. Вищий score = вищий пріоритет уведомлення.
 *
 * Маніфест:
 *   - онлайн та активні — першими (швидкість)
 *   - хто реально відгукується — вище (заповнюваність заявок)
 *   - високий рейтинг — пріоритет (якість)
 *   - не перевантажені — пріоритет (баланс)
 *   - новачки отримують boost — щоб мали шанс (справедливість)
 *   - кого щойно завалили заявками — тимчасово нижче (розкидаємо навантаження)
 *
 * Усі поля читаємо захищено (?? ): один undefined із БД не має давати NaN,
 * інакше зламається сортування всього списку.
 */
export function scoreCandidate(c: Candidate, now: Date): number {
  let score = 0

  // ─── Швидкість: онлайн визначається свіжістю lastSeen ───
  // Не довіряємо флагу isOnline (він не скидається в false при виході).
  const lastSeenMs = c.lastSeen ? c.lastSeen.getTime() : 0
  const minsSinceSeen = (now.getTime() - lastSeenMs) / 60000
  if (minsSinceSeen < 5)
    score += SCORE.ONLINE // реально онлайн зараз
  else if (minsSinceSeen < 30) score += SCORE.SEEN_5MIN
  else if (minsSinceSeen < 60) score += SCORE.SEEN_1HOUR
  else if (minsSinceSeen < 60 * 24) score += SCORE.SEEN_24HOUR

  // ─── Заповнюваність: відзивчивість ───
  // responseRate уже згладжений (новачок ≈ 0.5, не караємо за брак історії).
  score += (c.responseRate ?? 0.5) * SCORE.RESPONSIVENESS_MULTIPLIER

  // ─── Якість: рейтинг ───
  score += (c.avgRating ?? 0) * SCORE.RATING_MULTIPLIER

  // ─── Довіра: верифікація (бонус, не фільтр) ───
  if (c.isVerified) score += SCORE.VERIFIED

  // ─── Справедливість: boost новачкам ───
  if (isNewMaster(c, now)) {
    score += SCORE.NEW_MASTER_BOOST
  }

  // ─── Баланс: штраф за прийняті активні замовлення ───
  if ((c.activeOrders ?? 0) >= DISPATCH_CONFIG.MAX_ACTIVE_ORDERS) {
    score += SCORE.OVERLOADED_PENALTY
  }

  // ─── Балансування навантаження під сплеском ───
  // Лінійний штраф за недавні розсилки (без стелі): під лавиною заявок «зірки»
  // швидко опускаються, і робота розкидається рівно. У спокої recent≈0 — без впливу.
  // Природне вікно (RECENT_LOAD_WINDOW_MIN) не дає штрафу копитися вічно.
  score -= (c.recentNotifications ?? 0) * SCORE.RECENT_LOAD_PENALTY

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
 * Згладжена відзивчивість майстра (Лаплас): (responded + 1) / (notified + 2).
 * Без історії → ≈0.5 (нейтрально), щоб новачки не каралися за відсутність даних.
 */
export function responseRate(notified: number, responded: number): number {
  return (responded + 1) / (notified + 2)
}

/** Рахує score для всіх кандидатів і сортує (вищий — першим). */
export function scoreAll(
  candidates: Candidate[],
  now: Date = new Date(),
): ScoredCandidate[] {
  return candidates
    .map((c) => ({ id: c.id, score: scoreCandidate(c, now) }))
    .sort((a, b) => b.score - a.score)
}
