import { redirect } from '@sveltejs/kit'
import { requireStaff } from '$lib/server/admin/guard'
import { loadMetrics, PERIODS, type Period } from '$lib/server/admin/metrics'
import { atLeast } from '$lib/admin/roles'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
  const staff = await requireStaff(locals)
  // Модераторові метрики ні до чого — його робота в анкетах і скаргах.
  if (!atLeast(staff.role, 'MANAGER')) redirect(303, '/admin/moderation')

  const raw = url.searchParams.get('period')
  const period: Period = raw && raw in PERIODS ? (raw as Period) : '30d'
  return { metrics: await loadMetrics(period) }
}
