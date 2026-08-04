import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

// Тільки вибір ролі. Дані форм вантажать дочірні роути.
export const load: PageServerLoad = ({ locals }) => {
  // Роль уже обрана й профіль заповнено — повертатись до вибору нікому
  // не можна: клієнт став би мастером в обхід апгрейду, мастер узагалі
  // не має шляху назад. Апгрейд CLIENT → MASTER живе на /dashboard/profile.
  //
  // account заповнює guardHandle у hooks — другий SELECT не потрібен.
  if (locals.account?.onboarded) redirect(303, '/dashboard/profile')

  return {}
}
