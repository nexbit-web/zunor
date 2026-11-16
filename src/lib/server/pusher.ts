import Pusher from 'pusher'
import { env } from '$env/dynamic/private'

/** Серверний Pusher для подій з API. */
export const pusherServer = new Pusher({
  appId: env.PUSHER_APP_ID!,
  key: env.PUSHER_KEY!,
  secret: env.PUSHER_SECRET!,
  cluster: env.PUSHER_CLUSTER ?? 'eu',
  useTLS: true,
})

export const channels = {
  chat: (chatId: string) => `private-chat-${chatId}`,
  user: (userId: string) => `private-user-${userId}`,
  presence: (chatId: string) => `presence-chat-${chatId}`,
  admin: 'private-admin', // ← канал CRM-адмінів
}

export const events = {
  messageNew: 'message:new',
  messageEdit: 'message:edit',
  messageDelete: 'message:delete',
  messageRead: 'message:read',
  messageReaction: 'message:reaction',
  /** Картка посилання дійшла після самого повідомлення. */
  messagePreview: 'message:preview',
  chatUpdate: 'chat:update',
  /**
   * Хтось прочитав чат — особистим каналам усіх учасників (список чатів):
   * співрозмовникові ✓✓, самому читачеві на інших пристроях — 0 непрочитаних.
   */
  chatRead: 'chat:read',
  /**
   * Зміна статусу замовлення.
   * Замінює SYSTEM-повідомлення у стрічці: оновлює плашку в шапці чату,
   * не створюючи запис у Message і не накручуючи лічильник непрочитаних.
   */
  orderStatus: 'order:status',
  typing: 'client-typing',
  moderationNew: 'moderation:new',
  /** Нова скарга (Report) — у CRM-модераторів. Несе лише id і причину. */
  reportNew: 'report:new',
} as const

/** Подія без винятку: збій Pusher логуємо, запит не падає — дані вже в базі. */
export async function safeTrigger(
  channel: string | string[],
  event: string,
  data: unknown,
): Promise<void> {
  try {
    await pusherServer.trigger(channel, event, data)
  } catch (err) {
    // * розшифровуємо помилку щоб у логах було видно конкретну причину
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
    // * НЕ кидаємо далі — щоб основний flow не падав
  }
}
