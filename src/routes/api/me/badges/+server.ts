import { json } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import type { RequestHandler } from './$types'

/** GET /api/me/badges — початковий лічильник сповіщень: раз за сесію, далі — події Pusher. */
export const GET: RequestHandler = async ({ locals }) => {
  const user = requireApiUser(locals)

  const notifications = await prisma.notification.count({
    where: { userId: user.id, isRead: false },
  })

  return json({ notifications })
}
