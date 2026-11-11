// GET /api/chats/[id] — шапка чату для застосунку: співрозмовник, «у
// мережі», межі прочитаного (✓✓). Самі повідомлення — окремо,
// GET /api/chats/[id]/messages, сторінками.
//
// Ті самі дані, що й сторінка чату на сайті, — тим самим завантажувачем
// (`loadChatDetails`), а з ним і та сама перевірка членства.

import { error, json } from '@sveltejs/kit'
import { loadChatDetails } from '$lib/server/chat-details'
import { requireApiUser } from '$lib/server/guards'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireApiUser(locals)

  const chat = await loadChatDetails(params.id, user.id)
  // 404, а не 403: чужий чат не має відрізнятися від неіснуючого.
  if (!chat) throw error(404, 'Чат не знайдено')

  return json({ chat, currentUserId: user.id })
}
