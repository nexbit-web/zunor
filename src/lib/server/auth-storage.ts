// * сховище better-auth у Redis: база лишається джерелом правди, Redis — копія.
// * Видалення збою не ковтає: інакше вихід чи бан лишали б сесію живою

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
