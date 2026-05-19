// src/lib/server/chats-loader.ts
import { prisma } from '$lib/prisma'
import type { ChatPreview } from '$lib/components/chat/types'

/**
 * Загружает превью чатов юзера одним эффективным запросом.
 * Используется в:
 *   - src/routes/+layout.server.ts (для бейджа в хедере)
 *   - src/routes/(auth)/messages/+layout.server.ts (для списка чатов)
 *   - src/routes/api/chats/+server.ts (для refresh из chat-store)
 */
export async function loadChatsForUser(userId: string): Promise<ChatPreview[]> {
  const memberships = await prisma.chatMember.findMany({
    where: { userId },
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

  // Один groupBy вместо N запросов
  const unread = await prisma.message.groupBy({
    by: ['chatId'],
    where: {
      chatId: { in: chatIds },
      senderId: { not: userId },
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
