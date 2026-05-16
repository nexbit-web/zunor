// src/routes/api/me/badges/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import type { RequestHandler } from './$types'

/**
 * GET /api/me/badges
 *
 * Бэйджи для шапки: непрочитанные уведомления и чаты.
 */
export const GET: RequestHandler = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const userId = session.user.id

  const [unreadNotifications, unreadChats] = await Promise.all([
    prisma.notification.count({
      where: { userId, isRead: false },
    }),
    prisma.chatMember.count({
      where: {
        userId,
        chat: {
          messages: {
            some: {
              senderId: { not: userId },
              isRead: false,
            },
          },
        },
      },
    }),
  ])

  return json({
    notifications: unreadNotifications,
    messages: unreadChats,
  })
}
