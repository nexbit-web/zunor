import { prisma } from '$lib/server/prisma'
import { requireUser } from '$lib/server/guards'
import { MESSAGE_SELECT, toChatMessage } from '$lib/server/chat-messages'
import { freshest, lastSeenMany } from '$lib/server/presence'
import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import type { ChatDetails } from '$lib/components/chat/types'

const PAGE_SIZE = 50

export const load: PageServerLoad = async ({ params, locals }) => {
  const chatId = params.chatId
  const userId = requireUser(locals).id

  // Обидва запити залежать лише від chatId, тому йдуть паралельно:
  // послідовно це були два round-trip до Neon на кожне відкриття чату.
  // Доступ це не послаблює — перевірка membership нижче однаково відсікає
  // чужий чат ДО того, як повідомлення потраплять у відповідь.
  const [membership, messages] = await Promise.all([
    prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
      select: {
        lastReadAt: true,
        chat: {
          select: {
            id: true,
            members: {
              select: {
                // lastReadAt співрозмовника — з нього галочки ✓✓.
                lastReadAt: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
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
    }),
    // Замовлення тут навмисно НЕ вантажимо: чат — тільки для спілкування.
    // Статус замовлення живе на /dashboard/orders, у сповіщеннях і в OrderEvent.
    prisma.message.findMany({
      // type != SYSTEM — legacy-рядки більше не частина стрічки
      where: { chatId, type: { not: 'SYSTEM' } },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
      select: MESSAGE_SELECT,
    }),
  ])

  if (!membership) throw error(404, 'Чат не знайдено')

  const peerMember = membership.chat.members.find((m) => m.user.id !== userId)
  const peer = peerMember?.user
  if (!peer) throw error(404, 'Співрозмовник не знайдено')

  // Точний час — з Redis, якщо він є; база пишеться рідше (presence.ts).
  // Запит лише ПІСЛЯ перевірки членства: «коли був у мережі» — теж дані
  // людини, і чужому їх не видно.
  const seen = await lastSeenMany([peer.id])
  const peerLastSeen = peer.lastSeen
    ? freshest(peer.lastSeen, seen.get(peer.id))
    : (seen.get(peer.id) ?? null)

  // Роль беремо з locals.account (її вже прочитав guardHandle) — окремий
  // SELECT був третім запитом на відкриття чату.
  const myRole = locals.account?.role ?? null

  const hasMore = messages.length > PAGE_SIZE
  const items = hasMore ? messages.slice(0, PAGE_SIZE) : messages
  const nextCursor = hasMore ? items[items.length - 1].id : null

  const chat: ChatDetails = {
    id: membership.chat.id,
    peer: {
      id: peer.id,
      name: peer.name ?? '',
      username: peer.username,
      avatar: peer.avatar,
      isVerified: peer.masterProfile?.verificationStatus === 'VERIFIED',
    },
    members: membership.chat.members.map((m) => ({
      id: m.user.id,
      name: m.user.name ?? '',
      username: m.user.username,
      avatar: m.user.avatar,
      isVerified: m.user.masterProfile?.verificationStatus === 'VERIFIED',
    })),
    myLastReadAt: membership.lastReadAt?.toISOString() ?? null,
    peerLastReadAt: peerMember.lastReadAt?.toISOString() ?? null,
    peerLastSeen: peerLastSeen?.toISOString() ?? null,
    mutedUntil: null,
  }

  return {
    chat,
    initialMessages: items.map(toChatMessage),
    initialNextCursor: nextCursor,
    currentUserId: userId,
    currentUserRole: myRole,
  }
}
