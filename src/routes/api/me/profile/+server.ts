import { error, json } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { loadClientProfileForm } from '$lib/server/settings-data'
import type { RequestHandler } from './$types'

/** GET /api/me/profile — профіль замовника й довідники для форми в застосунку. */
export const GET: RequestHandler = async ({ locals }) => {
  const user = requireApiUser(locals)

  const data = await loadClientProfileForm(user.id)
  if (!data) error(401, 'Unauthorized')

  return json(data)
}
