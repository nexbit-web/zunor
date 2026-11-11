// GET /api/pusher/config — публічний ключ і кластер Pusher для застосунку.
//
// Ті самі PUBLIC_PUSHER_KEY / PUBLIC_PUSHER_CLUSTER, що вже стоять у JS
// кожної сторінки кабінету, — не секрет. Віддаємо з сервера, а не тримаємо
// копією в .env застосунку: ключ dev- і бойового сайту різний, і застосунок
// бере саме той, до чийого API ходить. Ключа немає — `key: null`, і
// застосунок лишається на перепиті.

import { json } from '@sveltejs/kit'
import { env } from '$env/dynamic/public'
import { requireApiUser } from '$lib/server/guards'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals }) => {
  // Живий канал потрібен лише з сесією — без неї й підписатись нема на що.
  requireApiUser(locals)
  return json({
    key: env.PUBLIC_PUSHER_KEY || null,
    cluster: env.PUBLIC_PUSHER_CLUSTER || 'eu',
  })
}
