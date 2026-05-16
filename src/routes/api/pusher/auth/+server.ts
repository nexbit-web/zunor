// src/routes/api/pusher/auth/+server.ts
import { error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
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
export const POST: RequestHandler = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const formData = await request.formData()
  const socketId = formData.get('socket_id')?.toString()
  const channel = formData.get('channel_name')?.toString()

  if (!socketId || !channel) {
    throw error(400, 'Missing socket_id or channel_name')
  }

  const userId = session.user.id

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

  // Перевіряємо, що юзер — член цього чату
  const membership = await prisma.chatMember.findUnique({
    where: {
      chatId_userId: { chatId, userId },
    },
    select: {
      user: {
        select: { id: true, name: true, avatar: true },
      },
    },
  })

  if (!membership) throw error(403, 'Not a member of this chat')

  if (isPresence) {
    const presenceData = {
      user_id: membership.user.id,
      user_info: {
        name: membership.user.name ?? 'Користувач',
        avatar: membership.user.avatar ?? '',
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
