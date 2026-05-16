// src/routes/api/chats/[id]/read/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { channels, events, safeTrigger } from '$lib/server/pusher'
import type { RequestHandler } from './$types'

/**
 * POST /api/chats/[id]/read — позначити чат як прочитаний.
 *
 * Принцип fail-tolerant: помилка Pusher НЕ ламає основний flow —
 * lastReadAt оновлюється у БД у будь-якому разі. Без real-time
 * пуша інший юзер побачить «прочитано» при наступному оновленні.
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const chatId = params.id
  const userId = session.user.id

  const membership = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: { id: true },
  })
  if (!membership) throw error(403, 'Not a member')

  const now = new Date()

  await prisma.$transaction([
    prisma.chatMember.update({
      where: { id: membership.id },
      data: { lastReadAt: now },
    }),
    prisma.message.updateMany({
      where: {
        chatId,
        senderId: { not: userId },
        isRead: false,
        createdAt: { lte: now },
      },
      data: { isRead: true },
    }),
  ])

  // Safe trigger — не падає при помилці Pusher
  await safeTrigger(channels.chat(chatId), events.messageRead, {
    chatId,
    readerId: userId,
    lastReadAt: now.toISOString(),
  })

  return json({ ok: true })
}