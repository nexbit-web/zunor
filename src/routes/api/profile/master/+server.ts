import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { saveMasterProfile } from '$lib/server/profile'
import { limit } from '$lib/server/rate-limit'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireApiUser(locals)

  // Кожна подача шле сповіщення модераторам — без ліміту це спам-канал.
  const rl = limit(`profile:${user.id}`, { points: 20, duration: 60 * 60_000 })
  if (!rl.success) throw error(429, 'Забагато спроб. Спробуйте пізніше.')

  const body = await request.json().catch(() => null)
  await saveMasterProfile(user.id, body)

  return json({ ok: true })
}
