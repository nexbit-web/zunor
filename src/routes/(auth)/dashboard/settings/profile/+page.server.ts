import { redirect } from '@sveltejs/kit'
import { loadProfileData } from '$lib/server/profile'
import { requireUser } from '$lib/server/guards'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const user = requireUser(locals, '/dashboard/settings/profile')

  // * ще не проходив онбординг — спершу туди: тут редагування вже
  // * заповненого профілю, а не первинне створення
  if (!locals.account?.onboarded) redirect(303, '/dashboard/onboarding')

  // * роль береться з БД, а не з URL: не можна відкрити «редагування
  // * як клієнт», якщо ти майстер
  return await loadProfileData(user.id)
}
