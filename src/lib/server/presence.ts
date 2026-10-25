// «Онлайн» майстра: коли його востаннє бачили (lastSeen). Єдиний споживач —
// бал підбору (dispatch/core/score.ts), де пороги свіжості 5 / 30 / 60 хв.
//
// Точний час живе в Redis і пишеться часто; у базу — рідко: лише щоб пул
// кандидатів (orderBy lastSeen) брав живих і щоб без Redis усе працювало.
// Без Redis база пишеться так само часто, як раніше.

import { prisma } from './prisma'
import { attempt, redisEnabled, redisKey } from './redis'

const MINUTE = 60_000

/** Redis — не частіше: похибка в 2 хв на межі «онлайн» нічого не змінює. */
const REDIS_EVERY_MS = 2 * MINUTE
/** База — запасний і грубий час: точний читається з Redis. */
const DB_EVERY_MS = redisEnabled ? 30 * MINUTE : 5 * MINUTE
/** Довше за найдовший поріг свіжості в балі (доба). */
const REDIS_TTL_SEC = 2 * 24 * 60 * 60

const MAX_TRACKED = 5_000

interface Written {
  redis: number
  db: number
}

const written = new Map<string, Written>()

const seenKey = (userId: string) => redisKey('seen', userId)

export function touchPresence(userId: string): void {
  const now = Date.now()
  const last = written.get(userId) ?? { redis: 0, db: 0 }

  if (redisEnabled && now - last.redis >= REDIS_EVERY_MS) {
    last.redis = now
    void attempt((r) => r.set(seenKey(userId), now, { ex: REDIS_TTL_SEC }))
  }

  if (now - last.db >= DB_EVERY_MS) {
    last.db = now
    // Fail-soft: presence не має ламати запит.
    prisma.user
      .update({ where: { id: userId }, data: { lastSeen: new Date(now) } })
      .catch(() => {})
  }

  written.set(userId, last)
  if (written.size > MAX_TRACKED) prune(now)
}

/**
 * Точний lastSeen для списку користувачів — однією командою. Кого в Redis
 * немає (або Redis вимкнений), у мапі немає: тоді береться час із бази.
 */
export async function lastSeenMany(
  userIds: readonly string[],
): Promise<Map<string, Date>> {
  if (userIds.length === 0) return new Map()

  const values = await attempt((r) =>
    r.mget<(string | null)[]>(...userIds.map(seenKey)),
  )
  const seen = new Map<string, Date>()
  values?.forEach((value, i) => {
    const ms = Number(value)
    if (value !== null && Number.isFinite(ms))
      seen.set(userIds[i], new Date(ms))
  })
  return seen
}

/** Свіжіший із двох: база й Redis пишуться з різною частотою. */
export function freshest(db: Date, redis: Date | undefined): Date {
  return redis && redis > db ? redis : db
}

function prune(now: number): void {
  for (const [id, w] of written) {
    if (now - Math.max(w.redis, w.db) > DB_EVERY_MS * 2) written.delete(id)
  }
  // Усі свіжі — стеля важливіша: гірше лише кілька зайвих записів.
  if (written.size > MAX_TRACKED) written.clear()
}
