import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export const load: PageServerLoad = ({ locals, url }) => {
  // Два входи на цю сторінку:
  //   1. одразу після signUp — сесії ще немає, email приходить у ?email=
  //   2. логін непідтвердженим акаунтом — email беремо з сесії (надійніше)
  const fromSession = locals.user?.email ?? null
  const raw = url.searchParams.get('email')?.trim().toLowerCase() ?? ''
  const fromQuery = EMAIL_RE.test(raw) && raw.length <= 254 ? raw : null

  const email = fromSession ?? fromQuery
  if (!email) redirect(303, '/user/register')

  return { email }
}
