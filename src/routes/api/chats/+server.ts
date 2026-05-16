// src/routes/api/chats/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import type { RequestHandler } from './$types'
import type { ChatPreview } from '$lib/components/chat/types'

export const GET: RequestHandler = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const userId = session.user.id

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

  const chatIds = memberships.map((m) => m.chat.id)
  const unreadByChatId = new Map<string, number>()

  if (chatIds.length > 0) {
    const unreadCounts = await Promise.all(
      memberships.map(async (m) => {
        const count = await prisma.message.count({
          where: {
            chatId: m.chat.id,
            senderId: { not: userId },
            deletedAt: null,
            createdAt: m.lastReadAt ? { gt: m.lastReadAt } : undefined,
          },
        })
        return { chatId: m.chat.id, count }
      }),
    )
    unreadCounts.forEach((u) => unreadByChatId.set(u.chatId, u.count))
  }

  const chats: ChatPreview[] = memberships
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

  return json({ chats })
}
