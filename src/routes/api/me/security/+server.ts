import { json } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { loadSecuritySettings } from '$lib/server/settings-data'
import type { RequestHandler } from './$types'

/**
 * GET /api/me/security — способи входу й чи можна зараз видалити акаунт
 * (Налаштування → Безпека в застосунку). Ті самі дані, що на сторінці
 * /dashboard/settings/security.
 */
export const GET: RequestHandler = async ({ locals }) => {
  const user = requireApiUser(locals)
  return json(await loadSecuritySettings(user))
}
