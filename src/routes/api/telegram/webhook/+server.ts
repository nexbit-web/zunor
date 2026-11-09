import { error } from '@sveltejs/kit'
import { telegramWebhook } from '$lib/server/telegram'
import type { RequestHandler } from './$types'

/**
 * POST /api/telegram/webhook — оновлення від Telegram (прод; у dev бот
 * працює через polling, див. $lib/server/telegram).
 *
 * Сесії тут немає й не треба: справжність запиту перевіряє grammY за
 * секретним заголовком X-Telegram-Bot-Api-Secret-Token (без нього — 401).
 * Секрет бот передає Telegram сам, коли ставить вебхук на старті процесу.
 */
export const POST: RequestHandler = async (event) => {
  const handle = telegramWebhook()
  if (!handle) error(404, 'Not found')
  return handle(event)
}
