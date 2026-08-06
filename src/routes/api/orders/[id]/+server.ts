import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { masterRatingSelect, flattenMasterRating } from '$lib/server/user-dto'
import type { RequestHandler } from './$types'

/**
 * GET /api/orders/[id] — детали заказа.
 *
 * Доступ только для client или master этого заказа.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      description: true,
      priceCents: true,
      currency: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      startedAt: true,
      completedAt: true,
      cancelledAt: true,
      cancelReason: true,
      cancelledById: true,
      clientId: true,
      masterId: true,
      chatId: true,
      client: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          city: true,
        },
      },
      master: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          city: true,
          ...masterRatingSelect,
        },
      },
      reviews: {
        select: {
          id: true,
          rating: true,
          comment: true,
          direction: true,
          authorId: true,
          createdAt: true,
        },
      },
      events: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          actorId: true,
          payload: true,
          createdAt: true,
        },
      },
    },
  })

  if (!order) throw error(404, 'Замовлення не знайдено')

  // Доступ
  if (order.clientId !== user.id && order.masterId !== user.id) {
    throw error(403, 'Доступ заборонено')
  }

  return json({
    order: { ...order, master: flattenMasterRating(order.master) },
  })
}
