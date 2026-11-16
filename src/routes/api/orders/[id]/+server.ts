import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { loadOrderDetail, orderDetailDto } from '$lib/server/order-detail'
import type { RequestHandler } from './$types'

/** GET /api/orders/[id] — замовлення цілком; дані й доступ як у сторінки сайту. Не сторона — 404. */
export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

  const order = await loadOrderDetail(params.id, user.id)
  if (!order) throw error(404, 'Замовлення не знайдено')

  return json({ order: orderDetailDto(order) })
}
