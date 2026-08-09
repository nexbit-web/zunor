import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireApiUser(locals)

  const body = await request.json().catch(() => ({}) as Record<string, unknown>)
  const orderId = String(body.orderId ?? '')
  const rating = Number(body.rating)
  const commentRaw = body.comment == null ? null : String(body.comment).trim()

  if (!orderId) throw error(400, 'Не вказано замовлення')
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw error(400, 'Рейтинг має бути від 1 до 5')
  }
  if (commentRaw && commentRaw.length > 2000) {
    throw error(400, 'Коментар занадто довгий')
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, clientId: true, masterId: true },
  })
  if (!order) throw error(404, 'Замовлення не знайдено')

  const userId = user.id
  const isClient = order.clientId === userId
  const isMaster = order.masterId === userId
  if (!isClient && !isMaster) throw error(403, 'Ви не учасник цього замовлення')

  if (order.status !== 'COMPLETED') {
    throw error(400, 'Відгук можна залишити лише після завершення замовлення')
  }

  // Напрямок + отримувач відгуку
  const direction = isClient ? 'CLIENT_TO_MASTER' : 'MASTER_TO_CLIENT'
  const targetId = isClient ? order.masterId : order.clientId

  // Чи вже є відгук цієї сторони
  const existing = await prisma.review.findUnique({
    where: { orderId_direction: { orderId, direction } },
    select: { id: true },
  })
  if (existing) throw error(409, 'Ви вже залишили відгук')

  // Транзакція: створюємо відгук + перераховуємо рейтинг отримувача
  // у правильному полі за напрямком (master/client)
  await prisma.$transaction(
    async (tx) => {
      await tx.review.create({
        data: {
          orderId,
          authorId: userId,
          direction,
          rating,
          comment: commentRaw || null,
        },
      })

      // Усі відгуки про отримувача (за напрямком, де він є ціллю)
      const agg = await tx.review.aggregate({
        where: {
          direction,
          order: isClient ? { masterId: targetId } : { clientId: targetId },
        },
        _avg: { rating: true },
        _count: { _all: true },
      })

      // Пишемо в правильне поле:
      //  - CLIENT_TO_MASTER → рейтинг отримувача-майстра
      //  - MASTER_TO_CLIENT → рейтинг отримувача-клієнта
      const data = isClient
        ? {
            avgRatingAsMaster: agg._avg.rating ?? 0,
            reviewsCountAsMaster: agg._count._all,
          }
        : {
            avgRatingAsClient: agg._avg.rating ?? 0,
            reviewsCountAsClient: agg._count._all,
          }

      await tx.user.update({
        where: { id: targetId },
        data,
      })
    },
    { maxWait: 10000, timeout: 20000 },
  )

  return json({ ok: true })
}
