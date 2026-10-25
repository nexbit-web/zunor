// Кеш «спершу Redis, потім база» для даних, що міняються рідко й явно.
//
// Значення проходить через JSON, тож тип перевіряється (JsonSafe): Date із
// Redis повернувся б рядком, і помилка вилізла б далеко від кешу. Дати —
// рядком ISO.

import { attempt, redisKey } from './redis'

type Primitive = string | number | boolean | null | undefined

/** T переживе JSON без втрат: жодних Date, функцій чи класів усередині. */
export type JsonSafe<T> = T extends Primitive
  ? T
  : T extends Date | ((...args: never[]) => unknown)
    ? never
    : T extends readonly (infer U)[]
      ? readonly JsonSafe<U>[]
      : { [K in keyof T]: JsonSafe<T[K]> }

/**
 * Покоління ключів у памʼяті процесу. Читач, що полетів у базу ДО
 * forget(), не має права записати в кеш застарілу відповідь ПІСЛЯ нього.
 */
const generations = new Map<string, number>()
const MAX_GENERATIONS = 10_000

export interface CacheOptions {
  /**
   * Кешувати «немає» (null). Так — для видаленого акаунта: інакше кожен
   * запит з ним бив би в базу. Ні — там, де «немає» може стати «є» будь-
   * якої миті (вільний сьогодні username).
   */
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
      // Битий запис — як промах: перечитаємо й перезапишемо.
    }
  }

  const generation = generations.get(full) ?? 0
  const value = await load()
  if (value === null && !cacheNull) return value
  if ((generations.get(full) ?? 0) === generation) {
    void attempt((r) => r.set(full, JSON.stringify(value), { ex: ttlSec }))
  }
  return value
}

/** Забути ключі. Чекати обовʼязково: наступне читання має піти в базу. */
export async function forget(...keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const full = keys.map((k) => redisKey(k))
  if (generations.size > MAX_GENERATIONS) generations.clear()
  for (const k of full) generations.set(k, (generations.get(k) ?? 0) + 1)
  await attempt((r) => r.del(...full))
}
