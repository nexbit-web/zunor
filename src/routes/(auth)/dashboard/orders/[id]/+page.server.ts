import { requireUser } from '$lib/server/guards'
import { loadOrderDetail } from '$lib/server/order-detail'
import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, locals }) => {
  const sessionUser = requireUser(locals, `/dashboard/orders/${params.id}`)
  const userId = sessionUser.id

  // Той самий завантажувач і та сама перевірка доступу, що в
  // GET /api/orders/[id] (застосунок). Не сторона угоди — 404, не 403.
  const order = await loadOrderDetail(params.id, userId)
  if (!order) throw error(404, 'Замовлення не знайдено')

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
