import { requireUser } from '$lib/server/guards'
import { loadNotificationSettings } from '$lib/server/settings-data'
import type { PageServerLoad } from './$types'

// Дані — ті самі, що бачить застосунок (GET /api/telegram/link).
export const load: PageServerLoad = async ({ locals }) => {
  const user = requireUser(locals, '/dashboard/settings/notifications')
  return await loadNotificationSettings(user.id)
}
