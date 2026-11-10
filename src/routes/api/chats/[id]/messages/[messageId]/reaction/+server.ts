import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { channels, events, safeTrigger } from '$lib/server/pusher'
import { limit } from '$lib/server/rate-limit'
import { groupReactions, isReaction } from '$lib/components/chat/reactions'
import type { RequestHandler } from './$types'

/**
 * PUT /api/chats/[id]/messages/[messageId]/reaction
 * Body: { emoji: string | null }
 *
 * Ставить МОЮ реакцію рівно в те, що прийшло: емодзі — поставити чи
 * замінити, null — зняти. «Та сама ще раз — зняти» вирішує браузер
 * (nextReaction): так повтор запиту після обриву мережі не перемикає
 * реакцію туди-сюди.
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const user = requireApiUser(locals)

  // Подвійний клік ставить і знімає — ліміт щедрий, але скрипт, що
  // смикає реакцію в циклі, у розсилку Pusher не пройде.
  const rl = await limit(`react:${user.id}`, { points: 120, duration: 60_000 })
  if (!rl.success) throw error(429, 'Забагато реакцій, зачекайте хвилинку')

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') throw error(400, 'Invalid JSON')
  const raw = (body as { emoji?: unknown }).emoji ?? null
  // Лише з закритого набору: інакше в базу й у чужу вкладку через Pusher
  // їхав би будь-який рядок.
  if (raw !== null && !isReaction(raw)) throw error(400, 'Невідома реакція')
  const emoji = raw

  // Повідомлення — саме цього чату, а чат — мій. Усе чуже — 404: не
  // підтверджуємо, що таке повідомлення взагалі існує.
  const message = await prisma.message.findFirst({
    where: {
      id: params.messageId,
      chatId: params.id,
      chat: { members: { some: { userId: user.id } } },
    },
    select: { id: true, deletedAt: true },
  })
  if (!message) throw error(404, 'Повідомлення не знайдено')
  if (message.deletedAt) throw error(400, 'Повідомлення видалено')

  if (emoji) {
    await prisma.messageReaction.upsert({
      where: {
        messageId_userId: { messageId: message.id, userId: user.id },
      },
      create: { messageId: message.id, userId: user.id, emoji },
      // Нова реакція — у кінець ряду, як щойно поставлена.
      update: { emoji, createdAt: new Date() },
    })
  } else {
    await prisma.messageReaction.deleteMany({
      where: { messageId: message.id, userId: user.id },
    })
  }

  // Віддаємо й розсилаємо ПОВНИЙ стан, а не різницю: вкладка, що
  // пропустила попередню подію, все одно покаже правду.
  const reactions = groupReactions(
    await prisma.messageReaction.findMany({
      where: { messageId: message.id },
      select: { emoji: true, userId: true },
      orderBy: { createdAt: 'asc' },
    }),
  )

  await safeTrigger(channels.chat(params.id), events.messageReaction, {
    chatId: params.id,
    messageId: message.id,
    reactions,
  })

  return json({ reactions })
}
