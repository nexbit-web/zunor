// src/routes/(auth)/dashboard/messages/+layout.server.ts
//
// Список чатів вантажиться САМЕ тут, а не в (auth)-лейауті: на /messages
// він — зміст сторінки, тож має прийти з SSR. На решті дашборда він потрібен
// лише для бейджа, і туди його доставляє chatStore одним запитом за сесію.

import { redirect } from '@sveltejs/kit'
import { loadChatsForUser } from '$lib/server/chats-loader'
import { requireUser } from '$lib/server/guards'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ locals }) => {
  const user = requireUser(locals)
  if (!locals.session) redirect(302, '/user/login')

  return {
    chats: await loadChatsForUser(user.id),
    currentUserId: user.id,
  }
}
