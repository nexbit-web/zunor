/**
 * Простий in-memory rate-limit за ключем.
 *
 *   const { success } = await limit(key, { points: 10, duration: 60_000 })
 *   if (!success) return new Response('Too Many', { status: 429 })
 *
 * Дані живуть у памʼяті одного процесу: рестарт обнуляє лічильники, а другий
 * інстанс зробить ліміт неточним — тоді потрібне спільне сховище.
 */

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

// Ключі тут user-scoped. Якщо колись знадобиться лімітувати за IP, бери його
// з `event.getClientAddress()`, а не з X-Forwarded-For: лівий елемент цього
// заголовка задає клієнт, тобто дає новий ключ на кожен запит — і обхід
// ліміту, і накачування Map.
