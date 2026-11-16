import { error } from '@sveltejs/kit'
import { telegramWebhook } from '$lib/server/telegram'
import type { RequestHandler } from './$types'

/** POST — оновлення від Telegram. Сесії немає: запит перевіряє grammY за секретним заголовком. */
export const POST: RequestHandler = async (event) => {
  const handle = telegramWebhook()
  if (!handle) error(404, 'Not found')
  return handle(event)
}
