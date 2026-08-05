// src/routes/api/chats/+server.ts
import { json } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { loadChatsForUser } from '$lib/server/chats-loader'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireApiUser(locals)

  const chats = await loadChatsForUser(user.id)
  return json({ chats })
}
