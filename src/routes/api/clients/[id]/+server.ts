import { json, error } from '@sveltejs/kit'
import { loadClientProfile } from '$lib/server/client-profile'
import { requireApiUser } from '$lib/server/guards'
import type { RequestHandler } from './$types'

/**
 * GET /api/clients/[id] — профіль клієнта для застосунку. Той самий код, що
 * в сторінки сайту: лише майстер, без телефону; інакше 404.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

  const profile = await loadClientProfile(user.id, params.id)
  if (!profile) throw error(404, 'Профіль не знайдено')

  return json({ profile })
}
