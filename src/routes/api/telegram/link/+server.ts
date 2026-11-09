import { json } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { unlinkUser } from '$lib/server/telegram'
import type { RequestHandler } from './$types'

/**
 * DELETE /api/telegram/link — «Відключити Telegram» у налаштуваннях
 * сповіщень. Підключення йде не сюди, а через бота: посилання
 * t.me/<бот>?start=<токен> дає лоадер сторінки налаштувань, а чат
 * записує сам бот, отримавши /start (див. $lib/server/telegram).
 */
export const DELETE: RequestHandler = async ({ locals }) => {
  const user = requireApiUser(locals)
  await unlinkUser(user.id)
  return json({ ok: true })
}
