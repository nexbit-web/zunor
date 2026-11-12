import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { channels, events, safeTrigger } from '$lib/server/pusher'
import type { RequestHandler } from './$types'

/**
 * POST /api/chats/[id]/read — позначити чат як прочитаний.
 *
 * Принцип fail-tolerant: помилка Pusher НЕ ламає основний flow —
 * lastReadAt оновлюється у БД у будь-якому разі. Без real-time
 * пуша інший юзер побачить «прочитано» при наступному оновленні.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

  const chatId = params.id
  const userId = user.id

  const membership = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: {
      id: true,
      chat: { select: { members: { select: { userId: true } } } },
    },
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

  // Safe trigger — не падає при помилці Pusher. Усе одночасно:
  //   message:read — відкритому чату (✓✓ у бульбашках);
  //   chat:read    — особистим каналам учасників: списку чатів, де розмова
  //                  закрита. Співрозмовник бачить ✓✓ біля свого
  //                  останнього, а сам читач на інших пристроях — згаслий
  //                  лічильник. Без цього список чекав перезавантаження.
  const read = { chatId, readerId: userId, lastReadAt: now.toISOString() }
  await Promise.all([
    safeTrigger(channels.chat(chatId), events.messageRead, read),
    ...(membership.chat?.members ?? []).map((m) =>
      safeTrigger(channels.user(m.userId), events.chatRead, read),
    ),
  ])

  return json({ ok: true })
}
