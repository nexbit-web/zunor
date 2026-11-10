import { redirect } from '@sveltejs/kit'
import { requireUser } from '$lib/server/guards'
import { loadAssistantSettings } from '$lib/server/settings-data'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const user = requireUser(locals, '/dashboard/settings/assistant')

  // Другий рубіж після фільтра в рейці: прямий перехід за URL
  // майстра сюди не пустить.
  if (locals.account?.role !== 'CLIENT')
    redirect(303, '/dashboard/settings/appearance')

  // Дані — ті самі, що бачить застосунок (GET /api/profile/ai-profile).
  return await loadAssistantSettings(user.id)
}
