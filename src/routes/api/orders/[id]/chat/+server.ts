// src/routes/api/orders/[id]/chat/+server.ts
//
// POST /api/orders/[id]/chat — відкрити чат по замовленню.
//
// Чат створюється ЛИШЕ звідси, тобто в момент, коли учасник справді
// натиснув «Написати». Раніше він створювався автоматично разом із
// замовленням у /api/proposals/[id]/accept, і кожен вибір майстра плодив
// порожній чат: він одразу з'являвся в обох списках повідомлень, хоча
// ніхто не написав жодного слова.
//
// Ендпоінт ідемпотентний: якщо чат уже є — просто повертає його id.

import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: { id: true, clientId: true, masterId: true, chatId: true },
  })

  // 404, а не 403: 403 підтвердив би, що замовлення існує, і дозволив би
  // перебором зібрати карту бази.
  if (!order) throw error(404, 'Замовлення не знайдено')
  if (order.clientId !== user.id && order.masterId !== user.id) {
    throw error(404, 'Замовлення не знайдено')
  }

  if (order.chatId) return json({ chatId: order.chatId })

  const chatId = await prisma.$transaction(async (tx) => {
    // Перечитуємо всередині транзакції: два швидких кліки поспіль інакше
    // створили б два чати, і другий перезаписав би посилання в замовленні.
    const fresh = await tx.order.findUnique({
      where: { id: order.id },
      select: { chatId: true },
    })
    if (fresh?.chatId) return fresh.chatId

    const chat = await tx.chat.create({
      data: {
        members: {
          create: [{ userId: order.clientId }, { userId: order.masterId }],
        },
      },
      select: { id: true },
    })

    await tx.order.update({
      where: { id: order.id },
      data: { chatId: chat.id },
    })

    return chat.id
  })

  return json({ chatId }, { status: 201 })
}
