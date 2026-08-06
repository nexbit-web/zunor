import type { ChatPreview } from '$lib/components/chat/types'
import { prisma } from './prisma'

/**
 * Стеля списку чатів. Список відсортований за свіжістю, тож зріз ріже лише
 * «хвіст», який у сайдбарі ніхто не гортає. Без ліміту запит ріс би разом з
 * історією юзера.
 */
const MAX_CHATS = 100

export async function loadChatsForUser(userId: string): Promise<ChatPreview[]> {
  const memberships = await prisma.chatMember.findMany({
    where: { userId },
    take: MAX_CHATS,
    select: {
      lastReadAt: true,
      chat: {
        select: {
          id: true,
          updatedAt: true,
          lastMessageText: true,
          lastMessageAt: true,
          lastSenderId: true,
          members: {
            where: { userId: { not: userId } },
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  avatar: true,
                  masterProfile: {
                    select: { verificationStatus: true },
                  },
                },
              },
            },
            take: 1,
          },
        },
      },
    },
    orderBy: { chat: { lastMessageAt: 'desc' } },
  })

  if (memberships.length === 0) return []

  const chatIds = memberships.map((m) => m.chat.id)
  const unreadByChatId = new Map<string, number>()

  // Один groupBy вместо N запросов.
  // type != SYSTEM — страховка для legacy-строк: системные события заказов
  // больше не сообщения и не должны накручивать счётчик непрочитанных.
  const unread = await prisma.message.groupBy({
    by: ['chatId'],
    where: {
      chatId: { in: chatIds },
      senderId: { not: userId },
      type: { not: 'SYSTEM' },
      deletedAt: null,
      isRead: false,
    },
    _count: { _all: true },
  })

  for (const row of unread) {
    unreadByChatId.set(row.chatId, row._count._all)
  }

  return memberships
    .filter((m) => m.chat.members.length > 0)
    .map((m) => {
      const peerUser = m.chat.members[0].user
      return {
        id: m.chat.id,
        peer: {
          id: peerUser.id,
          name: peerUser.name ?? '',
          username: peerUser.username,
          avatar: peerUser.avatar,
          isVerified: peerUser.masterProfile?.verificationStatus === 'VERIFIED',
        },
        lastMessageText: m.chat.lastMessageText,
        lastMessageAt: m.chat.lastMessageAt?.toISOString() ?? null,
        lastSenderId: m.chat.lastSenderId,
        unreadCount: unreadByChatId.get(m.chat.id) ?? 0,
        updatedAt: m.chat.updatedAt.toISOString(),
      }
    })
}
