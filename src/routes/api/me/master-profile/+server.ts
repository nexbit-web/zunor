import { error, json } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { loadMasterProfileForm } from '$lib/server/settings-data'
import type { RequestHandler } from './$types'

/**
 * GET /api/me/master-profile — анкета майстра для екрана «Профіль» у
 * застосунку: ті самі поля, що форма на сайті (dashboard/settings/profile),
 * стан перевірки й довідники категорій, міст і районів.
 *
 * Зберігає застосунок як і сайт — POST /api/profile/master (кожна подача —
 * повторна перевірка), фото профілю — POST /api/user/media.
 */
export const GET: RequestHandler = async ({ locals }) => {
  const user = requireApiUser(locals)

  const data = await loadMasterProfileForm(user.id)
  if (!data) error(401, 'Unauthorized')

  return json(data)
}
