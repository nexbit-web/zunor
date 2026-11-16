import { prisma } from './prisma'
import { cached, forget } from './cache'
import type { Role } from '../../generated/prisma/client'
import Pusher from 'pusher-js'
import { PUBLIC_PUSHER_KEY, PUBLIC_PUSHER_CLUSTER } from '$env/static/public'
import { building } from '$app/environment'
import { serverless } from './runtime'
export interface AccountState {
  id: string
  role: Role
  banned: boolean
  emailVerified: boolean
  onboarded: boolean
}

// * усе, що міняє сам застосунок, скидає кеш явно; TTL — лише межа для змін
// * повз нього (руками в базі). На Vercel памʼяті процесу немає — стан у Redis
const TTL_MS = serverless ? 0 : 5 * 60_000

// * другий рівень: переживає рестарт, після спливу памʼяті запит іде сюди, а не в базу
const REDIS_TTL_SEC = 30 * 60

const redisKeyOf = (userId: string) => `account:${userId}`

// * стеля: запис ~200 байт, 5000 ≈ 1 МБ
const MAX_ENTRIES = 5_000

interface Entry {
  state: AccountState | null
  expiresAt: number
}

const cache = new Map<string, Entry>()

// * Map тримає порядок вставки — найстаріший вилітає першим
function evictIfNeeded(): void {
  if (cache.size <= MAX_ENTRIES) return
  const oldest = cache.keys().next().value
  if (oldest !== undefined) cache.delete(oldest)
}

// * памʼять процесу → Redis → база; null («користувача немає») теж кешується
export async function getAccountState(
  userId: string,
): Promise<AccountState | null> {
  const now = Date.now()
  const hit = cache.get(userId)

  if (hit && hit.expiresAt > now) return hit.state

  const state = await cached(redisKeyOf(userId), REDIS_TTL_SEC, () =>
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        banned: true,
        emailVerified: true,
        onboarded: true,
      },
    }),
  )

  if (TTL_MS > 0) {
    cache.set(userId, { state, expiresAt: now + TTL_MS })
    evictIfNeeded()
  }

  return state
}

// * кликати після запису, що міняє ці поля, і чекати: інакше наступний запит
// * прочитає з Redis застаріле
export async function invalidateAccount(userId: string): Promise<void> {
  cache.delete(userId)
  await forget(redisKeyOf(userId))
}

// * для тестів
export function clearAccountCache(): void {
  cache.clear()
}

// * CRM пише в ту саму базу, але до памʼяті процесу не дістає — скидання кешу
// * приходить службовим каналом Pusher; він несе лише userId
function subscribeToInvalidations(): void {
  // * під час збірки підключатись нікуди; на Vercel памʼяті процесу немає
  if (building || serverless) return

  try {
    const pusher = new Pusher(PUBLIC_PUSHER_KEY, {
      cluster: PUBLIC_PUSHER_CLUSTER,
    })

    pusher
      .subscribe('account-updates')
      .bind('invalidate', (data: { userId?: string }) => {
        if (typeof data?.userId === 'string')
          void invalidateAccount(data.userId)
      })
  } catch (err) {
    // * без підписки кеш просто протухне за TTL
    console.error('[account-cache] pusher subscribe failed:', err)
  }
}

subscribeToInvalidations()
