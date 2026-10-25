// Фальшивий Upstash Redis у памʼяті — для vi.mock('@upstash/redis').
//
// Підмінюється лише мережевий клієнт: redis.ts, cache.ts і решта працюють
// справжні, тож тести бачать і префікс ключів, і fail-soft, і strict.
// Команди — рівно ті, що кличе застосунок; значення — рядки, як з
// automaticDeserialization: false.

import { vi } from 'vitest'

export const store = new Map<string, string>()
export const ttls = new Map<string, number>()

let broken: Error | null = null

/** Усі команди падають — як Upstash, що лежить або не відповів вчасно. */
export function breakRedis(err = new Error('upstash unreachable')): void {
  broken = err
}

function command<A extends unknown[], R>(run: (...args: A) => R) {
  return vi.fn(async (...args: A): Promise<R> => {
    if (broken) throw broken
    return run(...args)
  })
}

export const fakeRedis = {
  get: command((key: string) => store.get(key) ?? null),
  set: command((key: string, value: unknown, opts?: { ex?: number }) => {
    store.set(key, String(value))
    if (opts?.ex !== undefined) ttls.set(key, opts.ex)
    else ttls.delete(key)
    return 'OK'
  }),
  del: command((...keys: string[]) => {
    let removed = 0
    for (const key of keys) if (store.delete(key)) removed++
    return removed
  }),
  mget: command((...keys: string[]) => keys.map((k) => store.get(k) ?? null)),
}

export function resetRedis(): void {
  store.clear()
  ttls.clear()
  broken = null
  for (const fn of Object.values(fakeRedis)) fn.mockClear()
}

/** Модуль '@upstash/redis': конструктор віддає фальшивий клієнт. */
export const upstashModule = {
  Redis: vi.fn(function Redis() {
    return fakeRedis
  }),
}
