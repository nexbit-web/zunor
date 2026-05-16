// src/lib/server/pusher.ts
import Pusher from 'pusher'
import { env } from '$env/dynamic/private'

/**
 * Серверний Pusher для broadcast подій з API endpoints.
 *
 * Налаштування у .env:
 *   PUSHER_APP_ID=xxx
 *   PUSHER_KEY=xxx
 *   PUSHER_SECRET=xxx
 *   PUSHER_CLUSTER=eu
 */
export const pusherServer = new Pusher({
  appId: env.PUSHER_APP_ID!,
  key: env.PUSHER_KEY!,
  secret: env.PUSHER_SECRET!,
  cluster: env.PUSHER_CLUSTER ?? 'eu',
  useTLS: true,
})

// ─── Канали ───
export const channels = {
  chat: (chatId: string) => `private-chat-${chatId}`,
  user: (userId: string) => `private-user-${userId}`,
  presence: (chatId: string) => `presence-chat-${chatId}`,
}

// ─── Події ───
export const events = {
  messageNew: 'message:new',
  messageEdit: 'message:edit',
  messageDelete: 'message:delete',
  messageRead: 'message:read',
  chatUpdate: 'chat:update',
  typing: 'client-typing',
} as const

/**
 * Безпечний broadcast: ловить помилки Pusher і логує їх замість того
 * щоб ронити весь HTTP-запит.
 *
 * Чому це важливо: якщо Pusher тимчасово недоступний (мережева помилка,
 * рейт-ліміт, помилка config), повідомлення все одно зберігається у БД,
 * а інший юзер побачить його при наступному завантаженні чату.
 */
export async function safeTrigger(
  channel: string | string[],
  event: string,
  data: unknown,
): Promise<void> {
  try {
    await pusherServer.trigger(channel, event, data)
  } catch (err) {
    // Розшифровуємо помилку щоб у логах було видно конкретну причину
    if (err && typeof err === 'object') {
      const e = err as {
        status?: number
        body?: string
        message?: string
        url?: string
      }
      console.error('[Pusher] trigger failed', {
        channel,
        event,
        status: e.status,
        message: e.message,
        body: e.body?.slice(0, 200),
        url: e.url,
      })
    } else {
      console.error('[Pusher] trigger failed (unknown)', err)
    }
    // НЕ кидаємо далі — щоб основний flow не падав
  }
}
