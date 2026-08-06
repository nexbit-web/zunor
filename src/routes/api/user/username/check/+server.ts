import { json } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { validateUsername } from '$lib/username'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireApiUser(locals)

  // Невалідний або зарезервований формат — одразу «недоступно».
  const v = validateUsername(url.searchParams.get('username') ?? '')
  if (!v.ok) return json({ available: false })

  const taken = await prisma.user.findFirst({
    where: { username: v.value, NOT: { id: user.id } },
    select: { id: true },
  })

  return json({ available: !taken })
}
