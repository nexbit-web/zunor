import { requireRole } from '$lib/server/guard'
import type { PageServerLoad } from './$types'

// Заявка без чату — лише клієнт, як і чат на /dashboard/jobs/new. Без
// цього лоадера майстер відкривав форму прямим посиланням.
export const load: PageServerLoad = async ({ locals, url }) => {
  await requireRole(locals, ['CLIENT'], url.pathname)
}
