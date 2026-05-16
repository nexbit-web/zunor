// src/routes/api/chats/[id]/messages/[messageId]/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { channels, events, safeTrigger } from '$lib/server/pusher'
import type { RequestHandler } from './$types'

const MAX_TEXT_LENGTH = 4000
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000 // 24 години на редагування

/**
 * PATCH /api/chats/[id]/messages/[messageId]
 * Body: { text: string }
 *
 * Редагування власного TEXT повідомлення в межах 24 годин.
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const body = await request.json().catch(() => null)
  const newText = String(body?.text ?? '').trim()
  if (!newText) throw error(400, 'Text required')
  if (newText.length > MAX_TEXT_LENGTH) throw error(400, 'Text too long')

  const message = await prisma.message.findUnique({
    where: { id: params.messageId },
    select: {
      id: true,
      type: true,
      senderId: true,
      chatId: true,
      createdAt: true,
      deletedAt: true,
    },
  })

  if (!message) throw error(404, 'Message not found')
  if (message.chatId !== params.id) throw error(403, 'Wrong chat')
  if (message.senderId !== session.user.id) throw error(403, 'Not your message')
  if (message.deletedAt) throw error(400, 'Message deleted')
  if (message.type !== 'TEXT') throw error(400, 'Only text can be edited')

  // Вікно редагування
  const age = Date.now() - message.createdAt.getTime()
  if (age > EDIT_WINDOW_MS) {
    throw error(400, 'Edit window expired')
  }

  const editedAt = new Date()
  await prisma.message.update({
    where: { id: params.messageId },
    data: { text: newText, editedAt },
  })

  // Якщо це останнє повідомлення в чаті — оновити кеш
  await prisma.chat.updateMany({
    where: {
      id: params.id,
      lastSenderId: session.user.id,
    },
    data: { lastMessageText: newText.slice(0, 200) },
  })

  await safeTrigger(channels.chat(params.id), events.messageEdit, {
    messageId: params.messageId,
    chatId: params.id,
    text: newText,
    editedAt: editedAt.toISOString(),
  })

  return json({
    ok: true,
    text: newText,
    editedAt: editedAt.toISOString(),
  })
}

/**
 * DELETE /api/chats/[id]/messages/[messageId]
 *
 * Soft delete власного повідомлення. У UI замість тексту покажеться
 * "Повідомлення видалено".
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const message = await prisma.message.findUnique({
    where: { id: params.messageId },
    select: {
      id: true,
      senderId: true,
      chatId: true,
      deletedAt: true,
    },
  })

  if (!message) throw error(404, 'Message not found')
  if (message.chatId !== params.id) throw error(403, 'Wrong chat')
  if (message.senderId !== session.user.id) throw error(403, 'Not your message')
  if (message.deletedAt) {
    return json({ ok: true, alreadyDeleted: true })
  }

  const deletedAt = new Date()
  await prisma.message.update({
    where: { id: params.messageId },
    data: { deletedAt },
  })

  await safeTrigger(channels.chat(params.id), events.messageDelete, {
    messageId: params.messageId,
    chatId: params.id,
  })

  return json({ ok: true, deletedAt: deletedAt.toISOString() })
}
