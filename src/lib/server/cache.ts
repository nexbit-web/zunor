// * кеш «Redis → база» для даних, що міняються рідко й явно. Значення йде
// * через JSON, тому тип обмежений JsonSafe: Date повернувся б рядком

import { attempt, redisKey } from './redis'
import { background } from './background'

type Primitive = string | number | boolean | null | undefined

/** T переживе JSON без втрат: жодних Date, функцій чи класів усередині. */
export type JsonSafe<T> = T extends Primitive
  ? T
  : T extends Date | ((...args: never[]) => unknown)
    ? never
    : T extends readonly (infer U)[]
      ? readonly JsonSafe<U>[]
      : { [K in keyof T]: JsonSafe<T[K]> }

// * покоління ключа: читач, що пішов у базу до forget(), не запише застаріле після нього
const generations = new Map<string, number>()
const MAX_GENERATIONS = 10_000

export interface CacheOptions {
  /** Кешувати й «немає» (null). Вимкнути там, де «немає» будь-якої миті стає «є». */
  cacheNull?: boolean
}

export async function cached<T>(
  key: string,
  ttlSec: number,
  load: () => Promise<T & JsonSafe<T>>,
  { cacheNull = true }: CacheOptions = {},
): Promise<T> {
  const full = redisKey(key)
  const hit = await attempt((r) => r.get<string>(full))
  if (hit !== null) {
    try {
      return JSON.parse(hit) as T
    } catch {
      // * битий запис — як промах
    }
  }

  const generation = generations.get(full) ?? 0
  const value = await load()
  if (value === null && !cacheNull) return value
  if ((generations.get(full) ?? 0) === generation) {
    background(
      attempt((r) => r.set(full, JSON.stringify(value), { ex: ttlSec })),
      'cache set',
    )
  }
  return value
}

// * чекати обовʼязково: наступне читання має піти в базу
export async function forget(...keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const full = keys.map((k) => redisKey(k))
  if (generations.size > MAX_GENERATIONS) generations.clear()
  for (const k of full) generations.set(k, (generations.get(k) ?? 0) + 1)
  await attempt((r) => r.del(...full))
}
