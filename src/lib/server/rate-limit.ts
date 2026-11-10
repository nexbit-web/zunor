/**
 * Rate-limit за ключем, фіксоване вікно.
 *
 *   const { success } = await limit(key, { points: 10, duration: 60_000 })
 *   if (!success) return new Response('Too Many', { status: 429 })
 *
 * Де лічильники (AGENTS, 2.1):
 *   — один процес (Hostinger) — у памʼяті: точно й без мережі; рестарт
 *     обнуляє лічильники, і це прийнятно;
 *   — Vercel — у Redis: копій функції кілька, і в памʼяті кожна рахувала б
 *     своє, тобто ліміт множився б на кількість копій. Redis недоступний —
 *     падаємо на памʼять: краще неточний ліміт, ніж жодного.
 */

import { serverless } from './runtime'
import { attempt, redisEnabled, redisKey } from './redis'

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/**
 * Стеля на кількість кошиків. Чистка протухлих іде раз на хвилину — цього
 * мало, якщо ключ залежить від чогось під контролем клієнта: Map встигне
 * вирости безмежно й покласти процес, а процес у нас один на весь застосунок.
 * Зараз усі ключі user-scoped, але стеля робить цей клас помилок нефатальним.
 */
const MAX_BUCKETS = 20_000

// Періодично чистимо протухлі записи, щоб Map не ріс безкінечно
let lastCleanup = 0
function cleanup(now: number) {
  if (now - lastCleanup < 60_000) return
  lastCleanup = now
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k)
  }
}

/**
 * Аварійне скидання при переповненні.
 *
 * Викидаємо найстаріші записи (Map тримає порядок вставки). Так, це
 * послаблює ліміт для тих, кого викинули, — але вибір тут між «частина
 * лімітів скинулась» і «процес помер», і перше очевидно краще.
 */
function evictIfNeeded(now: number): void {
  if (buckets.size <= MAX_BUCKETS) return

  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k)
  }
  // Протухлих не вистачило — ріжемо найстаріші живі.
  let excess = buckets.size - MAX_BUCKETS
  if (excess <= 0) return
  for (const k of buckets.keys()) {
    buckets.delete(k)
    if (--excess <= 0) break
  }
}

export interface LimitOptions {
  /** Скільки запитів дозволено у вікні */
  points: number
  /** Розмір вікна у мілісекундах */
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

/**
 * INCR і термін вікна однією командою на сервері Redis: два окремі запити
 * між собою могли б розірватись, і ключ лишився б без терміну назавжди.
 */
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

// Ключі тут user-scoped. Якщо колись знадобиться лімітувати за IP, бери його
// з `event.getClientAddress()`, а не з X-Forwarded-For: лівий елемент цього
// заголовка задає клієнт, тобто дає новий ключ на кожен запит — і обхід
// ліміту, і накачування Map.
