import { error, json } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { loadMasterProfileForm } from '$lib/server/settings-data'
import type { RequestHandler } from './$types'

/** GET /api/me/master-profile — анкета майстра й довідники для форми в застосунку. */
export const GET: RequestHandler = async ({ locals }) => {
  const user = requireApiUser(locals)

  const data = await loadMasterProfileForm(user.id)
  if (!data) error(401, 'Unauthorized')

  return json(data)
}
