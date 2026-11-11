import { prisma } from '$lib/server/prisma'
import { requireUser } from '$lib/server/guards'
import { MESSAGE_SELECT, toChatMessage } from '$lib/server/chat-messages'
import { loadChatDetails } from '$lib/server/chat-details'
import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

const PAGE_SIZE = 50

export const load: PageServerLoad = async ({ params, locals }) => {
  const chatId = params.chatId
  const userId = requireUser(locals).id

  // Обидва запити залежать лише від chatId, тому йдуть паралельно:
  // послідовно це були два round-trip до Neon на кожне відкриття чату.
  // Доступ це не послаблює — перевірка membership (у loadChatDetails)
  // однаково відсікає чужий чат ДО того, як повідомлення потраплять у
  // відповідь. Той самий завантажувач віддає GET /api/chats/[id]
  // (застосунок).
  const [chat, messages] = await Promise.all([
    loadChatDetails(chatId, userId),
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

  if (!chat) throw error(404, 'Чат не знайдено')

  // Роль беремо з locals.account (її вже прочитав guardHandle) — окремий
  // SELECT був третім запитом на відкриття чату.
  const myRole = locals.account?.role ?? null

  const hasMore = messages.length > PAGE_SIZE
  const items = hasMore ? messages.slice(0, PAGE_SIZE) : messages
  const nextCursor = hasMore ? items[items.length - 1].id : null

  return {
    chat,
    initialMessages: items.map(toChatMessage),
    initialNextCursor: nextCursor,
    currentUserId: userId,
    currentUserRole: myRole,
  }
}
