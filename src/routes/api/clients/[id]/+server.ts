import { json, error } from '@sveltejs/kit'
import { loadClientProfile } from '$lib/server/client-profile'
import { requireApiUser } from '$lib/server/guards'
import type { RequestHandler } from './$types'

/**
 * GET /api/clients/[id] — профіль клієнта для застосунку: майстер
 * відкриває його із заявки чи замовлення (хто замовник, скільки замовлень,
 * рейтинг і відгуки від інших майстрів).
 *
 * Хто й що бачить — $lib/server/client-profile, той самий код, що й
 * сторінка сайту /dashboard/client/[id]: лише майстер, без телефону
 * (телефон — у замовленні, після угоди). Інакше — 404, а не 403: відповідь
 * не підтверджує, що профіль існує.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

  const profile = await loadClientProfile(user.id, params.id)
  if (!profile) throw error(404, 'Профіль не знайдено')

  return json({ profile })
}
