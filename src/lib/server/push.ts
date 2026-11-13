// Push-сповіщення в застосунок (../mobile) через Expo Push Service.
//
// Навіщо. Pusher живе лише поки застосунок відкритий, Telegram підключив
// не кожен. Push приходить на телефон завжди — а швидкість відгуку
// майстра — головна метрика (MANIFESTO, правило №2).
//
// Як:
//   • застосунок сам реєструє пристрій — POST /api/me/push з Expo-токеном
//     (таблиця PushToken), вимкнув push чи вийшов — DELETE;
//   • кожне сповіщення, що йде через pushNotification (notify() і хвилі
//     розсилки), летить на всі пристрої людини одним запитом до Expo;
//   • нове повідомлення в чаті — співрозмовникам (sendMessagePush, з
//     api/chats/[id]/messages), без запису в стрічку сповіщень;
//   • Expo відповів «пристрою вже немає» (DeviceNotRegistered —
//     застосунок видалили) — рядок геть, щоб не стукати марно.
//
// EXPO_ACCESS_TOKEN — необовʼязковий: потрібен, лише якщо в проєкті на
// expo.dev увімкнено «Enhanced Security for Push Notifications».
//
// Нічого не кидає: збій push не має валити дію, що породила сповіщення.

import { env } from '$env/dynamic/private'
import { prisma } from './prisma'
import type { Notification } from '../../generated/prisma/client'

const SEND_URL = 'https://exp.host/--/api/v2/push/send'

/** Скільки пристроїв тримаємо на людину — старші витісняються. */
export const MAX_DEVICES = 10

/** ExponentPushToken[…] (ExpoPushToken[…] — нова форма того ж). */
const TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,128}\]$/

export function isPushToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value)
}

export const PUSH_PLATFORMS = ['ios', 'android'] as const
export type PushPlatform = (typeof PUSH_PLATFORMS)[number]

export function isPushPlatform(value: unknown): value is PushPlatform {
  return PUSH_PLATFORMS.includes(value as PushPlatform)
}

/**
 * Що застосунок отримує в `data`: куди вести по дотику (те саме правило,
 * що й у стрічці сповіщень застосунку — `notificationTarget`) і що
 * позначити прочитаним. Поля лише додаємо — старі версії застосунку
 * живуть місяцями.
 */
function payload(n: Notification) {
  return {
    notificationId: n.id,
    type: n.type,
    jobId: n.jobId,
    orderId: n.orderId,
    chatId: n.chatId,
  }
}

interface Ticket {
  status: 'ok' | 'error'
  message?: string
  details?: { error?: string }
}

interface PushContent {
  title: string
  body?: string | null
  data: Record<string, unknown>
}

/** Розсилає сповіщення на всі пристрої його власника. */
export async function sendPush(notification: Notification): Promise<void> {
  await deliver([notification.userId], {
    title: notification.title,
    body: notification.body,
    data: payload(notification),
  })
}

/** Тип push про нове повідомлення — застосунок за ним гасить системний банер. */
export const MESSAGE_PUSH_TYPE = 'NEW_MESSAGE'

/**
 * Нове повідомлення в чаті — співрозмовникам на телефон, як у Telegram:
 * заголовок — хто написав, текст — що (фото й файл — підписом «📷 Фото»).
 * У стрічку сповіщень і в Telegram повідомлення не йдуть — лише push.
 * Відкритий застосунок системного банера не показує: там свій, зверху
 * (mobile, components/message-banner).
 */
export async function sendMessagePush(params: {
  recipients: string[]
  chatId: string
  messageId: string
  senderName: string | null
  text: string
}): Promise<void> {
  await deliver(params.recipients, {
    title: params.senderName?.trim() || 'Нове повідомлення',
    body: params.text,
    data: {
      type: MESSAGE_PUSH_TYPE,
      chatId: params.chatId,
      messageId: params.messageId,
    },
  })
}

/** Один запит до Expo на всі пристрої цих людей. Нічого не кидає. */
async function deliver(userIds: string[], content: PushContent): Promise<void> {
  if (!userIds.length) return
  try {
    const rows = await prisma.pushToken.findMany({
      // Забанений (і видалений — це теж бан) нічого не отримує.
      where: { userId: { in: userIds }, user: { banned: false } },
      select: { token: true },
      // Expo приймає до 100 повідомлень за запит.
      take: Math.min(userIds.length * MAX_DEVICES, 100),
    })
    if (!rows?.length) return

    const messages = rows.map(({ token }) => ({
      to: token,
      title: content.title,
      ...(content.body ? { body: content.body } : null),
      sound: 'default',
      // Android: канал, який створює застосунок (lib/push.ts там).
      channelId: 'default',
      priority: 'high',
      data: content.data,
    }))

    const accessToken = env.EXPO_ACCESS_TOKEN?.trim()
    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : null),
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.error('[push] expo responded', res.status, await res.text())
      return
    }

    // Квитки — у тому ж порядку, що й повідомлення.
    const { data } = (await res.json()) as { data?: Ticket[] }
    const gone = (data ?? [])
      .map((t, i) =>
        t.status === 'error' && t.details?.error === 'DeviceNotRegistered'
          ? messages[i]?.to
          : null,
      )
      .filter((t): t is string => Boolean(t))
    if (gone.length) {
      await prisma.pushToken.deleteMany({ where: { token: { in: gone } } })
    }
  } catch (err) {
    console.error('[push] send failed:', err)
  }
}
