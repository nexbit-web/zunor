// src/routes/api/user/username/check/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { validateUsername } from '$lib/username'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ request, url }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  // Невалідний або зарезервований формат — одразу «недоступно».
  const v = validateUsername(url.searchParams.get('username') ?? '')
  if (!v.ok) return json({ available: false })

  const taken = await prisma.user.findFirst({
    where: { username: v.value, NOT: { id: session.user.id } },
    select: { id: true },
  })

  return json({ available: !taken })
}
