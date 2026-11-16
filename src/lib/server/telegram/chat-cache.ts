// * чат Telegram людини — з кешем у памʼяті: хвиля розсилки шле десятки
// * сповіщень одночасно. Підключення й відключення скидають кеш; стеля є

import { prisma } from '../prisma'
import { serverless } from '../runtime'

/**
 * На Vercel копій функції кілька, а скидання кешу при (від)привʼязці діє
 * лише в одній: інші ще TTL слали б у відвʼязаний чат чи мовчали б після
 * привʼязки. Тому там TTL короткий — його вистачає на пачку однієї хвилі.
 */
const TTL_MS = serverless ? 30_000 : 10 * 60_000
const MAX_ENTRIES = 5_000

const cache = new Map<string, { chatId: string | null; at: number }>()

export async function chatIdOf(userId: string): Promise<string | null> {
  const hit = cache.get(userId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.chatId

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramChatId: true, banned: true },
  })
  // * забанений і видалений (він теж banned) у Telegram нічого не отримують
  const chatId = user && !user.banned ? user.telegramChatId : null

  if (cache.size >= MAX_ENTRIES) {
    // * найстаріший запис — перший у Map (порядок вставки)
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(userId, { chatId, at: Date.now() })
  return chatId
}

/** Підключили, відключили, видалили акаунт — наступне сповіщення піде в базу. */
export function forgetChatId(userId: string): void {
  cache.delete(userId)
}
