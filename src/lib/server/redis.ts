// * Upstash Redis — швидка памʼять перед базою: Neon тарифікує час роботи.
// * Необовʼязковий: без нього, при збої чи повільній відповіді все йде в базу

import { Redis } from '@upstash/redis'
import { env } from '$env/dynamic/private'

// * перший запит після простою — ще й TLS (до ~0,6 с); довше чекати немає сенсу
const TIMEOUT_MS = 1_000

// * після збою не питаємо зовсім: інакше кожен запит спершу чекав би таймаут
const COOLDOWN_MS = 30_000

// * Redis може бути спільним на кілька середовищ
const PREFIX = 'zunor:'

const client =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
        // * значення серіалізуємо самі: клієнт віддав би better-auth обʼєкт замість рядка
        automaticDeserialization: false,
        // * повтор — це ще один таймаут; збій обробляє запобіжник нижче
        retry: false,
        signal: () => AbortSignal.timeout(TIMEOUT_MS),
      })
    : null

export const redisEnabled = client !== null

let downUntil = 0

export function redisKey(...parts: string[]): string {
  return PREFIX + parts.join(':')
}

/** Команда, збій якої — промах кешу: null замість винятку. */
export async function attempt<T>(
  command: (redis: Redis) => Promise<T>,
): Promise<T | null> {
  if (!client || Date.now() < downUntil) return null
  try {
    return await command(client)
  } catch (err) {
    trip(err)
    return null
  }
}

/** Команда, збій якої ковтати не можна (відкликання сесії): пробуємо й під запобіжником. */
export async function strict<T>(
  command: (redis: Redis) => Promise<T>,
): Promise<T | null> {
  if (!client) return null
  try {
    return await command(client)
  } catch (err) {
    trip(err)
    throw err
  }
}

// * для тестів
export function resetRedisFuse(): void {
  downUntil = 0
}

function trip(err: unknown): void {
  const now = Date.now()
  // * лежачий Redis не засмічує лог рядком на кожен запит
  if (now >= downUntil) {
    console.warn('[redis] unavailable, using the database for 30s:', err)
  }
  downUntil = now + COOLDOWN_MS
}
