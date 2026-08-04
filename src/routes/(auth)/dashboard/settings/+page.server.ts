import { redirect } from '@sveltejs/kit'
import { DEFAULT_SECTION } from '$lib/components/settings'
import type { PageServerLoad } from './$types'

// Голий /settings нічого не показує — ведемо на перший розділ.
export const load: PageServerLoad = () => {
  redirect(307, `/dashboard/settings/${DEFAULT_SECTION}`)
}
