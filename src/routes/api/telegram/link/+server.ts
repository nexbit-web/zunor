import { json } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { unlinkUser } from '$lib/server/telegram'
import { loadNotificationSettings } from '$lib/server/settings-data'
import type { RequestHandler } from './$types'

/** GET — стан Telegram: `{ telegram: null }` або `{ telegram: { linked, linkUrl } }`; посилання живе 15 хв. */
export const GET: RequestHandler = async ({ locals }) => {
  const user = requireApiUser(locals)
  return json(await loadNotificationSettings(user.id))
}

/** DELETE — відключити Telegram. Підключення йде через бота (/start <токен>). */
export const DELETE: RequestHandler = async ({ locals }) => {
  const user = requireApiUser(locals)
  await unlinkUser(user.id)
  return json({ ok: true })
}
