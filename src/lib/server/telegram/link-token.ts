// Токен привʼязки Telegram: «цей чат належить цьому акаунту».
//
// Людина тисне «Підключити Telegram» → отримує посилання
// t.me/<бот>?start=<токен> → у Telegram натискає «Start» → бот отримує
// /start <токен> і записує її чат у User.telegramChatId.
//
// Токен підписаний (HMAC), а не лежить у таблиці: без бази, без
// прибирання прострочених рядків. Підпис не дає підробити чужий userId
// (інакше будь-хто читав би чужі сповіщення в себе в Telegram), строк
// життя — щоб посилання, що десь залишилось, не спрацювало через тиждень.
//
// Формат обмежує сам Telegram: параметр start — до 64 символів, лише
// A-Z a-z 0-9 _ -. Тому `<userId>_<строк base36>_<підпис base64url>`:
// cuid і base36 підкреслень не містять, тож розбір за першими двома «_»
// однозначний, навіть якщо «_» є в підписі.

import { createHmac, timingSafeEqual } from 'node:crypto'

export const LINK_TTL_MS = 15 * 60_000

/** Довжина підпису: 96 біт — підібрати неможливо, а в 64 символи влазить. */
const SIG_LENGTH = 16

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`telegram-link:${payload}`)
    .digest('base64url')
    .slice(0, SIG_LENGTH)
}

export function createLinkToken(
  userId: string,
  secret: string,
  now = Date.now(),
): string {
  const exp = Math.floor((now + LINK_TTL_MS) / 1000).toString(36)
  const payload = `${userId}_${exp}`
  return `${payload}_${sign(payload, secret)}`
}

/** userId з токена або null, якщо токен підроблений, зіпсований чи прострочений. */
export function verifyLinkToken(
  token: string,
  secret: string,
  now = Date.now(),
): string | null {
  if (!token || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return null
  }

  const first = token.indexOf('_')
  const second = token.indexOf('_', first + 1)
  if (first <= 0 || second <= first + 1) return null

  const userId = token.slice(0, first)
  const exp = token.slice(first + 1, second)
  const sig = token.slice(second + 1)

  const expected = sign(`${userId}_${exp}`, secret)
  if (sig.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null

  const expMs = parseInt(exp, 36) * 1000
  if (!Number.isFinite(expMs) || expMs < now) return null

  return userId
}
