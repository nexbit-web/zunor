// src/routes/api/user/username/check/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ request, url }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const raw = (url.searchParams.get('username') ?? '').trim().toLowerCase()
  if (!raw) return json({ available: false })
  if (!/^[a-z0-9_]{3,30}$/.test(raw)) return json({ available: false })

  const taken = await prisma.user.findFirst({
    where: { username: raw, NOT: { id: session.user.id } },
    select: { id: true },
  })

  return json({ available: !taken })
}
