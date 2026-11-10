// Сховище better-auth у Redis: сесії й одноразові коди. Для сесій база
// лишається джерелом правди (storeSessionInDatabase в auth.ts), Redis —
// швидка копія: промах у ньому означає лише запит до бази.
//
// Видалення збою не ковтає: інакше вихід з акаунта чи бан лишали б сесію
// живою в Redis до кінця її строку.

import type { BetterAuthOptions } from 'better-auth'
import { attempt, redisEnabled, redisKey, strict } from './redis'

type SecondaryStorage = NonNullable<BetterAuthOptions['secondaryStorage']>

const authKey = (key: string) => redisKey('auth', key)

export const authStorage: SecondaryStorage | undefined = redisEnabled
  ? {
      get: (key) => attempt((r) => r.get<string>(authKey(key))),
      set: async (key, value, ttl) => {
        await attempt((r) =>
          ttl && ttl > 0
            ? r.set(authKey(key), value, { ex: Math.max(1, Math.floor(ttl)) })
            : r.set(authKey(key), value),
        )
      },
      delete: async (key) => {
        await strict((r) => r.del(authKey(key)))
      },
    }
  : undefined
