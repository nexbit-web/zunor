// Ранжування відгуків для клієнта. Окремо від dispatch:
//   dispatch — кому слати уведомлення.
//   ranking  — як показати клієнту тих, хто відгукнувся.
//
// Маніфест (справедливість): топ-3 рекомендовані, але з гарантованим
// слотом для новачка. Решта — під кнопкою "показати всі".

import { DISPATCH_CONFIG } from './dispatch/types'

const { SCORE, MAX_ACTIVE_ORDERS, NEW_MASTER_DAYS, NEW_MASTER_ORDERS } =
  DISPATCH_CONFIG

/** Дані майстра, потрібні для ранжування відгуку. */
export interface RankableMaster {
  lastSeen: Date
  avgRating: number
  isVerified: boolean
  activeOrders: number
  masterSince: Date
  completedOrders: number
}

/** Відгук з даними для ранжування. */
export interface RankableProposal {
  id: string
  createdAt: Date
  master: RankableMaster
}

/** Скільки відгуків показуємо як "рекомендовані". */
const TOP_N = 3

/** Чи є майстер новачком. */
function isNewMaster(m: RankableMaster, now: Date): boolean {
  const days = (now.getTime() - m.masterSince.getTime()) / (1000 * 60 * 60 * 24)
  return days < NEW_MASTER_DAYS || m.completedOrders < NEW_MASTER_ORDERS
}

/** Score відгуку: якість майстра + швидкість відгуку. */
function scoreProposal(p: RankableProposal, now: Date): number {
  const m = p.master
  let score = 0

  // Свіжість активності майстра
  const minsSinceSeen = (now.getTime() - m.lastSeen.getTime()) / 60000
  if (minsSinceSeen < 5) score += SCORE.ONLINE
  else if (minsSinceSeen < 30) score += SCORE.SEEN_5MIN
  else if (minsSinceSeen < 60) score += SCORE.SEEN_1HOUR
  else if (minsSinceSeen < 60 * 24) score += SCORE.SEEN_24HOUR

  // Рейтинг
  score += m.avgRating * SCORE.RATING_MULTIPLIER

  // Верифікація — бонус
  if (m.isVerified) score += SCORE.VERIFIED

  // Перевантажений — штраф
  if (m.activeOrders >= MAX_ACTIVE_ORDERS) score += SCORE.OVERLOADED_PENALTY

  return score
}

/**
 * Повертає Set з ID відгуків, які треба позначити як "рекомендовані".
 *
 * Логіка:
 *   1. Рахуємо score кожного відгуку, сортуємо.
 *   2. При рівному score виграє той, хто відгукнувся ПЕРШИМ.
 *   3. Беремо топ-3.
 *   4. Якщо серед топ-3 немає новачка, але новачок відгукнувся —
 *      замінюємо найслабший слот топ-3 на найкращого новачка
 *      (гарантований слот новачку за маніфестом).
 */
export function getRecommendedIds(
  proposals: RankableProposal[],
  now: Date = new Date(),
): { recommended: Set<string>; newbies: Set<string> } {
  if (proposals.length === 0)
    return { recommended: new Set(), newbies: new Set() }

  const scored = proposals
    .map((p) => ({
      id: p.id,
      score: scoreProposal(p, now),
      at: p.createdAt.getTime(),
      isNew: isNewMaster(p.master, now),
    }))
    // Друге правило сортування — це і є «швидкість відгуку» з опису вгорі.
    // Без нього рівні майстри розкладались у порядку вибірки (createdAt
    // DESC), тобто виграє той, хто відгукнувся ОСТАННІМ — рівно навпаки
    // до обіцяного.
    .sort((a, b) => b.score - a.score || a.at - b.at)

  // Топ-3
  const top = scored.slice(0, TOP_N)
  const recommended = new Set(top.map((p) => p.id))

  // Гарантований слот новачку
  const hasNewInTop = top.some((p) => p.isNew)
  if (!hasNewInTop) {
    const bestNewbie = scored.slice(TOP_N).find((p) => p.isNew)
    if (bestNewbie && top.length === TOP_N) {
      const weakest = top[top.length - 1]
      recommended.delete(weakest.id)
      recommended.add(bestNewbie.id)
    }
  }

  // Множина всіх новачків (для мітки "Новачок")
  const newbies = new Set(scored.filter((p) => p.isNew).map((p) => p.id))

  return { recommended, newbies }
}
