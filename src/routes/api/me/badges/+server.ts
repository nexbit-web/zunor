// src/routes/api/me/badges/+server.ts
import { json } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import type { RequestHandler } from './$types'

/**
 * GET /api/me/badges
 *
 * Бэйджи для шапки: непрочитанные уведомления и чаты.
 */
export const GET: RequestHandler = async ({ locals }) => {
  const user = requireApiUser(locals)

  const userId = user.id

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
