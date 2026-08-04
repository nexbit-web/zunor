import { redirect } from '@sveltejs/kit'
import { loadProfileData } from '$lib/server/profile'
import { requireUser } from '$lib/server/guards'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const user = requireUser(locals, '/dashboard/profile')

  // Ще не проходив онбординг — спершу туди.
  if (!locals.account?.onboarded) redirect(303, '/dashboard/onboarding')

  // Роль береться з БД, а не з URL: не можна відкрити «редагування як клієнт»,
  // якщо ти майстер. Це і є технічна гарантія односторонності переходу.
  return await loadProfileData(user.id)
}
