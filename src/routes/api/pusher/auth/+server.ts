import { error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { isChatMember } from '$lib/server/chat-members'
import { pusherServer } from '$lib/server/pusher'
import type { RequestHandler } from './$types'

/**
 * Pusher викликає цей endpoint щоразу, коли клієнт subscribe'ається на
 * private- або presence-канал. Ми повинні перевірити що юзер має право
 * на цей канал і повернути signed token.
 *
 * Канали:
 *   private-user-{userId}     → тільки цей юзер
 *   private-chat-{chatId}     → тільки члени чату
 *   presence-chat-{chatId}    → тільки члени чату (з info про юзера)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireApiUser(locals)

  const formData = await request.formData()
  const socketId = formData.get('socket_id')?.toString()
  const channel = formData.get('channel_name')?.toString()

  if (!socketId || !channel) {
    throw error(400, 'Missing socket_id or channel_name')
  }

  const userId = user.id

  // ─── private-user-{userId} ───
  if (channel.startsWith('private-user-')) {
    const targetUserId = channel.slice('private-user-'.length)
    if (targetUserId !== userId) throw error(403, 'Forbidden')

    const authResponse = pusherServer.authorizeChannel(socketId, channel)
    return new Response(JSON.stringify(authResponse), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ─── private-chat-{chatId} та presence-chat-{chatId} ───
  let chatId: string | null = null
  let isPresence = false

  if (channel.startsWith('private-chat-')) {
    chatId = channel.slice('private-chat-'.length)
  } else if (channel.startsWith('presence-chat-')) {
    chatId = channel.slice('presence-chat-'.length)
    isPresence = true
  } else {
    throw error(400, 'Unknown channel type')
  }

  // Перевіряємо, що юзер — член цього чату (з кешу, chat-members.ts).
  if (!(await isChatMember(chatId, userId))) {
    throw error(403, 'Not a member of this chat')
  }

  if (isPresence) {
    // Імʼя й аватар — із сесії: окремий запит до бази заради них зайвий.
    const presenceData = {
      user_id: userId,
      user_info: {
        name: user.name || 'Користувач',
        avatar: user.image ?? '',
      },
    }
    const authResponse = pusherServer.authorizeChannel(
      socketId,
      channel,
      presenceData,
    )
    return new Response(JSON.stringify(authResponse), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const authResponse = pusherServer.authorizeChannel(socketId, channel)
  return new Response(JSON.stringify(authResponse), {
    headers: { 'Content-Type': 'application/json' },
  })
}
