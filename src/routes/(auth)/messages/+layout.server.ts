// src/routes/(auth)/messages/+layout.server.ts
import { redirect } from '@sveltejs/kit'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ parent }) => {
  const data = await parent()

  if (!data.session) throw redirect(302, '/user/login')

  return {
    chats: data.chats ?? [],
    currentUserId: data.session.user.id,
  }
}
