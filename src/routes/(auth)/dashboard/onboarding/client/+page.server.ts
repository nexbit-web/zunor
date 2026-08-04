import { redirect } from '@sveltejs/kit'
import { loadProfileData } from '$lib/server/profile'
import { requireUser } from '$lib/server/guards'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const user = requireUser(locals, '/dashboard/onboarding/client')

  // Профіль уже заповнено — це вже не онбординг, а редагування.
  if (locals.account?.onboarded) redirect(303, '/dashboard/profile')

  return await loadProfileData(user.id)
}
