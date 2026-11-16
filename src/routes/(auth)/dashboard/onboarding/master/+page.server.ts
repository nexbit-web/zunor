import { redirect } from '@sveltejs/kit'
import { loadProfileData } from '$lib/server/profile'
import { requireUser } from '$lib/server/guards'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const user = requireUser(locals, '/dashboard/onboarding/master')

  // * онбордженому майстрові тут нічого робити, а онбордженого клієнта
  // * пускаємо: для нього це апгрейд ролі
  if (locals.account?.onboarded && locals.account.role === 'MASTER') {
    redirect(303, '/dashboard/profile')
  }

  return await loadProfileData(user.id)
}
