// src/routes/api/chats/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { loadChatsForUser } from '$lib/server/chats-loader'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const chats = await loadChatsForUser(session.user.id)
  return json({ chats })
}
