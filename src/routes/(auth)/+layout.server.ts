import { prisma } from '$lib/server/prisma'
import { loadChatsForUser } from '$lib/server/chats-loader'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ locals, depends }) => {
  depends('app:badges')
  depends('app:chats')

  const session = locals.session
  if (!session?.user) {
    return { session: null, role: null, badges: null, chats: null }
  }

  const userId = session.user.id

  // Роль беремо з БД, а не з session.user.role: сесія кешується в cookie
  // на 5 хвилин, тому одразу після апгрейду CLIENT → MASTER там ще стара
  // роль — і сайдбар показує вкладки замовника мастеру.
  // guardHandle уже зробив цей SELECT на /dashboard/** → беремо готове.
  const account =
    locals.account ??
    (await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, onboarded: true, emailVerified: true },
    }))

  const [unreadNotifications, chats] = await Promise.all([
    prisma.notification.count({ where: { userId, isRead: false } }),
    loadChatsForUser(userId),
  ])

  // unread messages рахуємо з уже завантажених чатів — без окремого запиту.
  const unreadMessagesTotal = chats.reduce((sum, c) => sum + c.unreadCount, 0)

  return {
    session,
    role: account?.role ?? null,
    badges: {
      notifications: unreadNotifications,
      messages: unreadMessagesTotal,
    },
    chats,
  }
}