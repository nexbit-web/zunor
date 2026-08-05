// src/lib/rate-limit.ts

/**
 * Простий in-memory rate-limit за IP/ключем.
 *
 * ⚠️ ВАЖЛИВО для продакшну:
 * - Ця реалізація тримає дані в памʼяті одного процесу.
 *   При горизонтальному масштабуванні (кілька інстансів Node) — переходьте на Redis.
 * - Перезапуск сервера очищує ліміти.
 * - Для строгих гарантій використовуйте спеціалізовані рішення:
 *   Cloudflare Rate Limiting, Upstash Ratelimit, @vercel/functions rateLimit.
 *
 * Приклад використання:
 *   const { success } = await limit(ip, { points: 10, duration: 60_000 })
 *   if (!success) return new Response('Too Many', { status: 429 })
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/**
 * Стеля на кількість кошиків.
 *
 * Прибирання протухлих спрацьовує раз на хвилину — цього мало, якщо ключ
 * лімітування залежить від чогось, що атакуючий контролює. Тоді за одну
 * хвилину між чистками Map виростає безмежно й процес падає по пам'яті,
 * а процес у нас один на весь застосунок (див. AGENTS.md, розділ 2.1).
 *
 * Зараз усі ключі — user-scoped, тобто ріст обмежений числом акаунтів, але
 * покладатися на це не варто: варто комусь завести IP-ключ, і діра
 * з'явиться мовчки. Стеля робить цей клас помилок нефатальним.
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

export function limit(
  key: string,
  { points, duration }: LimitOptions,
): { success: boolean; remaining: number; resetAt: number } {
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

// ─────────────────────────────────────────────────────────────────────────
// Тут була getClientKey(request), яка брала ЛІВЕ значення X-Forwarded-For.
// Її прибрано, і повертати в такому вигляді не можна: лівий елемент XFF
// повністю під контролем клієнта. Заголовок `X-Forwarded-For: <випадкове>`
// дає новий ключ на кожен запит — це і обхід самого ліміту, і накачування
// Map чужими записами.
//
// Якщо колись знадобиться лімітувати за IP (для неавторизованих
// ендпоінтів — зараз таких немає, вхід і реєстрацію лімітує сам
// better-auth), бери IP з `event.getClientAddress()`. adapter-node рахує
// його за змінними ADDRESS_HEADER і XFF_DEPTH, тобто відкидає рівно
// стільки проксі, скільки їх насправді перед застосунком.
// ─────────────────────────────────────────────────────────────────────────
