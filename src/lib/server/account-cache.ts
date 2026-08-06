import { prisma } from './prisma'
import type { Role } from '../../generated/prisma/client'
import Pusher from 'pusher-js'
import { PUBLIC_PUSHER_KEY, PUBLIC_PUSHER_CLUSTER } from '$env/static/public'
import { building } from '$app/environment'
export interface AccountState {
  id: string
  role: Role
  banned: boolean
  emailVerified: boolean
  onboarded: boolean
}

/**
 * Верхня межа затримки ЛИШЕ для змін повз застосунок — наприклад, бан руками
 * в БД. Усе, що робить сам застосунок (онбординг, роль, бан, верифікація
 * пошти), скидає кеш явно через invalidateAccount і діє миттєво; CRM робить
 * те саме через Pusher (subscribeToInvalidations нижче). Тому TTL великий:
 * короткий означав би запит до бази майже на кожній навігації дашборда.
 */
const TTL_MS = 5 * 60_000

/** Стеля записів. Кожен ~200 байт, тож 5000 ≈ 1 МБ — стільки одночасних
 *  активних сесій на інстанс не буде. Захист від необмеженого росту. */
const MAX_ENTRIES = 5_000

interface Entry {
  state: AccountState | null
  expiresAt: number
}

const cache = new Map<string, Entry>()

/** Найстаріші записи вилітають першими: Map зберігає порядок вставки. */
function evictIfNeeded(): void {
  if (cache.size <= MAX_ENTRIES) return
  const oldest = cache.keys().next().value
  if (oldest !== undefined) cache.delete(oldest)
}

/**
 * Стан акаунта. Спершу кеш, при промаху — БД.
 *
 * null означає «користувача немає» і теж кешується: інакше запит із
 * видаленим акаунтом бив би в базу на кожній навігації.
 */
export async function getAccountState(
  userId: string,
): Promise<AccountState | null> {
  const now = Date.now()
  const hit = cache.get(userId)

  if (hit && hit.expiresAt > now) return hit.state

  const state = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      banned: true,
      emailVerified: true,
      onboarded: true,
    },
  })

  cache.set(userId, { state, expiresAt: now + TTL_MS })
  evictIfNeeded()

  return state
}

/**
 * Скидає кеш для користувача. Викликати ПІСЛЯ будь-якого запису,
 * що змінює ці поля: онбординг, апгрейд ролі, бан, верифікація пошти.
 *
 * Без цього людина після завершення онбордингу до 30 секунд поверталася б
 * на форму — guard бачив би застаріле onboarded: false.
 */
export function invalidateAccount(userId: string): void {
  cache.delete(userId)
}

/** Повне скидання. Потрібне хіба що в тестах. */
export function clearAccountCache(): void {
  cache.clear()
}

/**
 * Серверна підписка на службовий канал.
 *
 * CRM — окремий застосунок: вона пише в ту саму БД, але дотягнутися
 * до пам'яті нашого процесу не може. Спільний Pusher вирішує це краще
 * за HTTP-ендпоінт: працює на будь-якій кількості інстансів Zunor
 * (подію отримають усі) і не вимагає ще одного секрету.
 *
 * Канал публічний і несе лише userId — нічого приватного тут немає,
 * а хто його слухає, той і так має доступ до публічного ключа.
 */
function subscribeToInvalidations(): void {
  // building — під час prerender/збірки підключатись нікуди не треба.
  if (building) return

  try {
    const pusher = new Pusher(PUBLIC_PUSHER_KEY, {
      cluster: PUBLIC_PUSHER_CLUSTER,
    })

    pusher
      .subscribe('account-updates')
      .bind('invalidate', (data: { userId?: string }) => {
        if (typeof data?.userId === 'string') invalidateAccount(data.userId)
      })
  } catch (err) {
    // Не падаємо: без підписки кеш просто протухне за TTL (30 с).
    console.error('[account-cache] pusher subscribe failed:', err)
  }
}

subscribeToInvalidations()
