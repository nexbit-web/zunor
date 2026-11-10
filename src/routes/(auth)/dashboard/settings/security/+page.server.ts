import { requireUser } from '$lib/server/guards'
import { loadSecuritySettings } from '$lib/server/settings-data'
import type { PageServerLoad } from './$types'

// Дані — ті самі, що бачить застосунок (GET /api/me/security).
export const load: PageServerLoad = async ({ locals }) => {
  const user = requireUser(locals, '/dashboard/settings/security')
  return await loadSecuritySettings(user)
}
