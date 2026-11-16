// * чат очима учасника: співрозмовник, коли його бачили, до якого моменту
// * прочитано. Один завантажувач для сторінки чату й GET /api/chats/[id]

import type { ChatDetails } from '$lib/components/chat/types'
import { freshest, lastSeenMany } from './presence'
import { prisma } from './prisma'

/**
 * Деталі чату для `userId`, або null — він не учасник (чи чату немає,
 * чи співрозмовника). Назовні null — це 404: чужий чат не має
 * відрізнятися від неіснуючого.
 */
export async function loadChatDetails(
  chatId: string,
  userId: string,
): Promise<ChatDetails | null> {
  const membership = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: {
      lastReadAt: true,
      chat: {
        select: {
          id: true,
          members: {
            select: {
              // * lastReadAt співрозмовника — з нього галочки ✓✓
              lastReadAt: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                  role: true,
                  lastSeen: true,
                  masterProfile: {
                    select: { verificationStatus: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!membership) return null

  const peerMember = membership.chat.members.find((m) => m.user.id !== userId)
  const peer = peerMember?.user
  if (!peerMember || !peer) return null

  // * точний час — з Redis, якщо він є; база пишеться рідше (presence.ts).
  // * Запит лише ПІСЛЯ перевірки членства: «коли був у мережі» — теж дані
  // * людини, і чужому їх не видно
  const seen = await lastSeenMany([peer.id])
  const peerLastSeen = peer.lastSeen
    ? freshest(peer.lastSeen, seen.get(peer.id))
    : (seen.get(peer.id) ?? null)

  return {
    id: membership.chat.id,
    peer: {
      id: peer.id,
      name: peer.name ?? '',
      avatar: peer.avatar,
      role: peer.role,
      isVerified: peer.masterProfile?.verificationStatus === 'VERIFIED',
    },
    members: membership.chat.members.map((m) => ({
      id: m.user.id,
      name: m.user.name ?? '',
      avatar: m.user.avatar,
      isVerified: m.user.masterProfile?.verificationStatus === 'VERIFIED',
    })),
    myLastReadAt: membership.lastReadAt?.toISOString() ?? null,
    peerLastReadAt: peerMember.lastReadAt?.toISOString() ?? null,
    peerLastSeen: peerLastSeen?.toISOString() ?? null,
    mutedUntil: null,
  }
}
