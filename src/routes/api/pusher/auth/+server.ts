import { error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { isChatMember } from '$lib/server/chat-members'
import { pusherServer } from '$lib/server/pusher'
import type { RequestHandler } from './$types'

/**
 * Підпис на private- і presence-канали Pusher:
 *   private-user-{userId}   — лише ця людина
 *   private-chat-{chatId}   — лише учасники чату
 *   presence-chat-{chatId}  — лише учасники чату
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireApiUser(locals)

  // * браузер шле форму, застосунок — JSON: у нативного запиту немає Origin, і
  // * форму відхилила б CSRF-перевірка SvelteKit
  let socketId: string | undefined
  let channel: string | undefined
  if (request.headers.get('content-type')?.includes('application/json')) {
    const body = (await request.json().catch(() => null)) as {
      socket_id?: unknown
      channel_name?: unknown
    } | null
    socketId = typeof body?.socket_id === 'string' ? body.socket_id : undefined
    channel =
      typeof body?.channel_name === 'string' ? body.channel_name : undefined
  } else {
    const formData = await request.formData()
    socketId = formData.get('socket_id')?.toString()
    channel = formData.get('channel_name')?.toString()
  }

  if (!socketId || !channel) {
    throw error(400, 'Missing socket_id or channel_name')
  }

  const userId = user.id

  // * private-user-{userId}
  if (channel.startsWith('private-user-')) {
    const targetUserId = channel.slice('private-user-'.length)
    if (targetUserId !== userId) throw error(403, 'Forbidden')

    const authResponse = pusherServer.authorizeChannel(socketId, channel)
    return new Response(JSON.stringify(authResponse), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // * private-chat-{chatId} та presence-chat-{chatId}
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

  // * перевіряємо, що юзер — член цього чату (з кешу, chat-members.ts)
  if (!(await isChatMember(chatId, userId))) {
    throw error(403, 'Not a member of this chat')
  }

  if (isPresence) {
    // * імʼя й аватар — із сесії: окремий запит до бази заради них зайвий
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
