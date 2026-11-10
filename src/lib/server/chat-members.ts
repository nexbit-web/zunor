// Хто учасник якого чату — для авторизації каналів Pusher, що спрацьовує
// на кожне відкриття сторінки з чатом. Учасників із чату не прибирають,
// тож «так» тримаємо довго. «Ні» не кешуємо: чат могли створити мить тому.

import { prisma } from './prisma'
import { cached } from './cache'

const MEMBER_TTL_SEC = 7 * 24 * 60 * 60

export async function isChatMember(
  chatId: string,
  userId: string,
): Promise<boolean> {
  const member = await cached(
    `chat-member:${chatId}:${userId}`,
    MEMBER_TTL_SEC,
    async () =>
      (await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
        select: { chatId: true },
      }))
        ? true
        : null,
    { cacheNull: false },
  )
  return member === true
}
