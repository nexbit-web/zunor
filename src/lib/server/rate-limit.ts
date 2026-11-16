// * ліміт за ключем, фіксоване вікно:
// *   const { success } = await limit(key, { points: 10, duration: 60_000 })
// * Один процес — лічильники в памʼяті; Vercel — у Redis (копій функції кілька).
// * Redis недоступний — падаємо на памʼять: краще неточний ліміт, ніж жодного

import { serverless } from './runtime'
import { attempt, redisEnabled, redisKey } from './redis'

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// * стеля кошиків: ключ під контролем клієнта інакше ростив би Map без меж
const MAX_BUCKETS = 20_000

let lastCleanup = 0
function cleanup(now: number) {
  if (now - lastCleanup < 60_000) return
  lastCleanup = now
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k)
  }
}

// * переповнення: викидаємо найстаріші (Map тримає порядок вставки) — краще
// * скинути частину лімітів, ніж покласти процес
function evictIfNeeded(now: number): void {
  if (buckets.size <= MAX_BUCKETS) return

  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k)
  }
  // * протухлих не вистачило — ріжемо найстаріші живі
  let excess = buckets.size - MAX_BUCKETS
  if (excess <= 0) return
  for (const k of buckets.keys()) {
    buckets.delete(k)
    if (--excess <= 0) break
  }
}

export interface LimitOptions {
  /** Скільки запитів дозволено у вікні. */
  points: number
  /** Розмір вікна, мс. */
  duration: number
}

export interface LimitResult {
  success: boolean
  remaining: number
  resetAt: number
}

export async function limit(
  key: string,
  options: LimitOptions,
): Promise<LimitResult> {
  if (serverless && redisEnabled) {
    const shared = await limitShared(key, options)
    if (shared) return shared
  }
  return limitLocal(key, options)
}

// * INCR і термін — однією командою: між двома запитами ключ лишився б без терміну
const WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('PTTL', KEYS[1]) }
`

async function limitShared(
  key: string,
  { points, duration }: LimitOptions,
): Promise<LimitResult | null> {
  const reply = await attempt((r) =>
    r.eval<string[], [number, number]>(
      WINDOW_SCRIPT,
      [redisKey('rl', key)],
      [String(duration)],
    ),
  )
  if (!reply) return null
  const count = Number(reply[0])
  const ttl = Number(reply[1])
  if (!Number.isFinite(count)) return null
  return {
    success: count <= points,
    remaining: Math.max(0, points - count),
    resetAt: Date.now() + (ttl > 0 ? ttl : duration),
  }
}

/** Лічильник у памʼяті процесу. Окремо експортований — для тестів. */
export function limitLocal(
  key: string,
  { points, duration }: LimitOptions,
): LimitResult {
  const now = Date.now()
  cleanup(now)

  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt < now) {
    const resetAt = now + duration
    buckets.set(key, { count: 1, resetAt })
    evictIfNeeded(now)
    return { success: true, remaining: points - 1, resetAt }
  }

  if (bucket.count >= points) {
    return { success: false, remaining: 0, resetAt: bucket.resetAt }
  }

  bucket.count++
  return {
    success: true,
    remaining: points - bucket.count,
    resetAt: bucket.resetAt,
  }
}

// * потрібен ліміт за IP — бери event.getClientAddress(), не X-Forwarded-For:
// * лівий елемент заголовка задає клієнт
