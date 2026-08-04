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

// Періодично чистимо протухлі записи, щоб Map не ріс безкінечно
let lastCleanup = 0
function cleanup(now: number) {
  if (now - lastCleanup < 60_000) return
  lastCleanup = now
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k)
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

/**
 * Витягує ідентифікатор клієнта для rate-limit.
 * Пріоритет: X-Forwarded-For → X-Real-IP → remote address.
 */
export function getClientKey(request: Request, prefix = 'default'): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor
    ? forwardedFor.split(',')[0].trim()
    : (request.headers.get('x-real-ip') ?? 'unknown')
  return `${prefix}:${ip}`
}