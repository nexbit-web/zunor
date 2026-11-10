import { json } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { unlinkUser } from '$lib/server/telegram'
import { loadNotificationSettings } from '$lib/server/settings-data'
import type { RequestHandler } from './$types'

/**
 * GET /api/telegram/link — стан Telegram для налаштувань сповіщень у
 * застосунку: `{ telegram: null }` (бот не налаштований) або
 * `{ telegram: { linked, linkUrl } }`. Посилання з токеном живе 15 хв —
 * застосунок перечитує його, коли людина повертається з Telegram.
 */
export const GET: RequestHandler = async ({ locals }) => {
  const user = requireApiUser(locals)
  return json(await loadNotificationSettings(user.id))
}

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
