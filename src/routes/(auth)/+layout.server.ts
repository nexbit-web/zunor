// src/routes/+layout.server.ts
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { loadChatsForUser } from '$lib/server/chats-loader'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ request, depends }) => {
  depends('app:badges')
  depends('app:chats')

  const session = await auth.api.getSession({ headers: request.headers })

  if (!session?.user) {
    return { session: null, badges: null, chats: null }
  }

  const userId = session.user.id

  // Параллельно: notifications count + chats (с unread внутри)
  const [unreadNotifications, chats] = await Promise.all([
    prisma.notification.count({
      where: { userId, isRead: false },
    }),
    loadChatsForUser(userId),
  ])

  // unread messages считаем из уже загруженных чатов — без отдельного запроса к БД
  const unreadMessagesTotal = chats.reduce((sum, c) => sum + c.unreadCount, 0)

  return {
    session,
    badges: {
      notifications: unreadNotifications,
      messages: unreadMessagesTotal,
    },
    chats,
  }
}
