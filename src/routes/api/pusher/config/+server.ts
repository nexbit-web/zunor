// * GET /api/pusher/config — публічний ключ і кластер Pusher для застосунку:
// * він бере ключ того сайту, до чийого API ходить. Ключа немає — `key: null`

import { json } from '@sveltejs/kit'
import { env } from '$env/dynamic/public'
import { requireApiUser } from '$lib/server/guards'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals }) => {
  // * живий канал потрібен лише з сесією — без неї й підписатись нема на що
  requireApiUser(locals)
  return json({
    key: env.PUBLIC_PUSHER_KEY || null,
    cluster: env.PUBLIC_PUSHER_CLUSTER || 'eu',
  })
}
