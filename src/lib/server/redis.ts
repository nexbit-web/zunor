// Upstash Redis (HTTP) — швидка памʼять перед Neon. Neon тарифікує ЧАС
// РОБОТИ бази, тож усе, що читається часто, а міняється рідко, береться
// звідси: сесії, стан акаунта, «онлайн», довідники, публічні сторінки.
//
// Redis необовʼязковий: без UPSTASH_REDIS_REST_* кеш вимкнений і все йде в
// базу, як раніше. Збій чи повільна відповідь — теж лише промах кешу:
// застосунок не падає через кеш.

import { Redis } from '@upstash/redis'
import { env } from '$env/dynamic/private'

/**
 * Скільки чекати відповіді. Перший запит після простою — це ще й TLS
 * (до ~0,6 с), далі — десятки мілісекунд. Довше чекати немає сенсу:
 * база відповість не гірше.
 */
const TIMEOUT_MS = 1_000

/**
 * Після збою Redis стільки часу не питаємо зовсім: інакше кожен запит
 * чекав би таймаут і лише потім ішов у базу — гірше, ніж без кешу.
 */
const COOLDOWN_MS = 30_000

/** Redis може бути спільним для кількох середовищ — усе наше під префіксом. */
const PREFIX = 'zunor:'

const client =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
        // Значення — рядки, які ми серіалізуємо самі: інакше клієнт мовчки
        // розбирав би JSON і віддавав better-auth обʼєкт замість рядка.
        automaticDeserialization: false,
        // Повтор — це ще один таймаут на тому ж запиті. Збій обробляє
        // запобіжник нижче, а відповідь дає база.
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

/**
 * Команда, збій якої ковтати не можна — наприклад, відкликання сесії:
 * тихий збій лишив би сесію живою. Пробуємо навіть під запобіжником.
 * Без Redis — нічого не робить.
 */
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

/** Скинути запобіжник. Потрібно хіба що в тестах. */
export function resetRedisFuse(): void {
  downUntil = 0
}

function trip(err: unknown): void {
  const now = Date.now()
  // Лежачий Redis не має засмічувати лог рядком на кожен запит.
  if (now >= downUntil) {
    console.warn('[redis] unavailable, using the database for 30s:', err)
  }
  downUntil = now + COOLDOWN_MS
}
