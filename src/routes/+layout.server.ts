// src/routes/+layout.server.ts
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { loadChatsForUser } from '$lib/server/chats-loader'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ request, depends }) => {
  depends('app:badges')
  depends('app:chats') // ← новый маркер для чатов

  const session = await auth.api.getSession({ headers: request.headers })

  if (!session?.user) {
    return { session: null, badges: null, chats: null }
  }

  const userId = session.user.id

  // Все три запроса параллельно: notifications count, chats unread count, chats list
  const [unreadNotifications, unreadChats, chats] = await Promise.all([
    prisma.notification.count({
      where: { userId, isRead: false },
    }),
    prisma.chatMember.count({
      where: {
        userId,
        chat: {
          messages: {
            some: { senderId: { not: userId }, isRead: false },
          },
        },
      },
    }),
    loadChatsForUser(userId), // ← полный список чатов
  ])

  return {
    session,
    badges: {
      notifications: unreadNotifications,
      messages: unreadChats,
    },
    chats,
  }
}
