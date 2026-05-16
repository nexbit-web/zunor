// src/routes/(auth)/orders/[id]/+page.server.ts
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { redirect, error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    throw redirect(
      302,
      `/user/login?next=${encodeURIComponent(`/orders/${params.id}`)}`,
    )
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          city: true,
          avgRating: true,
          reviewsCount: true,
        },
      },
      master: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          city: true,
          avgRating: true,
          reviewsCount: true,
          masterProfile: {
            select: {
              verificationStatus: true,
              completedOrders: true,
            },
          },
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
    },
  })

  if (!order) throw error(404, 'Замовлення не знайдено')

  const userId = session.user.id
  if (order.clientId !== userId && order.masterId !== userId) {
    throw error(403, 'Доступ заборонено')
  }

  return {
    order: {
      ...order,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      startedAt: order.startedAt?.toISOString() ?? null,
      completedAt: order.completedAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      events: order.events.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
      reviews: order.reviews.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    },
    viewerId: userId,
  }
}
