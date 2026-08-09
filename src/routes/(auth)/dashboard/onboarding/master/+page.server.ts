import { redirect } from '@sveltejs/kit'
import { loadProfileData } from '$lib/server/profile'
import { requireUser } from '$lib/server/guards'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const user = requireUser(locals, '/dashboard/onboarding/master')

  // Майстер, який уже онбордився, редагує профіль на /dashboard/profile —
  // тут йому робити нічого.
  //
  // А от онбордженого КЛІЄНТА пускаємо: для нього ця сторінка —
  // апгрейд ролі CLIENT → MASTER, єдиний шлях стати виконавцем.
  // Саме на цій умові й ламався перехід: перевірка лише на onboarded
  // розвертала клієнта назад на /dashboard/profile.
  if (locals.account?.onboarded && locals.account.role === 'MASTER') {
    redirect(303, '/dashboard/profile')
  }

  return await loadProfileData(user.id)
}
