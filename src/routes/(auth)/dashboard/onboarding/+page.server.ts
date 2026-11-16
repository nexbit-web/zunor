import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

// * тільки вибір ролі. Дані форм вантажать дочірні роути
export const load: PageServerLoad = ({ locals }) => {
  // * профіль заповнено — до вибору ролі не повертаються; апгрейд CLIENT →
  // * MASTER живе на /dashboard/profile
  if (locals.account?.onboarded) redirect(303, '/dashboard/profile')

  return {}
}
