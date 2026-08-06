import { json } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import type { RequestHandler } from './$types'

/**
 * GET /api/me/badges — початковий лічильник непрочитаних сповіщень.
 *
 * Викликається ОДИН раз за сесію, зі стору сповіщень; далі число живе на
 * подіях Pusher. Раніше цей же ендпоінт рахував ще й непрочитані чати —
 * корельованим підзапитом по всій переписці. Він більше не потрібен:
 * chatStore рахує суму з уже завантаженого списку чатів, тобто без
 * жодного окремого запиту до бази.
 */
export const GET: RequestHandler = async ({ locals }) => {
  const user = requireApiUser(locals)

  const notifications = await prisma.notification.count({
    where: { userId: user.id, isRead: false },
  })

  return json({ notifications })
}
