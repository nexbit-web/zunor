// src/routes/api/chats/[id]/messages/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { channels, events, safeTrigger } from '$lib/server/pusher'
import { limit } from '$lib/rate-limit'
import type { RequestHandler } from './$types'
import type { ChatMessage } from '$lib/components/chat/types'
import type { MessageType } from '../../../../../generated/prisma/client'

const MESSAGE_PAGE_SIZE = 50
const MAX_TEXT_LENGTH = 4000

export const GET: RequestHandler = async ({ params, url, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const chatId = params.id
  const cursor = url.searchParams.get('cursor')

  const membership = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId: session.user.id } },
    select: { id: true },
  })
  if (!membership) throw error(403, 'Not a member')

  const messages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: 'desc' },
    take: MESSAGE_PAGE_SIZE + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    select: {
      id: true,
      type: true,
      text: true,
      attachmentUrl: true,
      attachmentMimeType: true,
      attachmentSize: true,
      attachmentName: true,
      isRead: true,
      editedAt: true,
      deletedAt: true,
      createdAt: true,
      senderId: true,
      replyToId: true,
      replyTo: {
        select: { id: true, text: true, senderId: true, type: true },
      },
    },
  })

  const hasMore = messages.length > MESSAGE_PAGE_SIZE
  const items = hasMore ? messages.slice(0, MESSAGE_PAGE_SIZE) : messages
  const nextCursor = hasMore ? items[items.length - 1].id : null

  const transformed: ChatMessage[] = items.map((m) => ({
    id: m.id,
    type: m.type,
    text: m.deletedAt ? '' : m.text,
    attachmentUrl: m.deletedAt ? null : m.attachmentUrl,
    attachmentMimeType: m.attachmentMimeType,
    attachmentSize: m.attachmentSize,
    attachmentName: m.attachmentName,
    isRead: m.isRead,
    editedAt: m.editedAt?.toISOString() ?? null,
    deletedAt: m.deletedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    senderId: m.senderId,
    replyToId: m.replyToId,
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          text: m.replyTo.text,
          senderId: m.replyTo.senderId,
          type: m.replyTo.type,
        }
      : null,
  }))

  return json({ messages: transformed, nextCursor })
}

export const POST: RequestHandler = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const rl = limit(`msg:${session.user.id}`, {
    points: 60,
    duration: 60_000,
  })
  if (!rl.success) throw error(429, 'Too many messages')

  const body = await request.json().catch(() => null)
  if (!body) throw error(400, 'Invalid JSON')

  const type: MessageType = body.type ?? 'TEXT'
  const text = String(body.text ?? '').trim()
  const replyToId = body.replyToId ? String(body.replyToId) : null

  if (type === 'TEXT' && !text) throw error(400, 'Text required')
  if (text.length > MAX_TEXT_LENGTH) throw error(400, 'Text too long')
  if ((type === 'PHOTO' || type === 'FILE') && !body.attachment?.url) {
    throw error(400, 'Attachment required')
  }

  const chatId = params.id

  const membership = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId: session.user.id } },
    select: {
      chat: {
        select: {
          members: {
            where: { userId: { not: session.user.id } },
            select: { userId: true },
          },
        },
      },
    },
  })
  if (!membership) throw error(403, 'Not a member')

  const previewText =
    type === 'TEXT'
      ? text.slice(0, 200)
      : type === 'PHOTO'
        ? '📷 Фото'
        : '📎 Файл'

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        chatId,
        senderId: session.user.id,
        type,
        text,
        attachmentUrl: body.attachment?.url ?? null,
        attachmentPublicId: body.attachment?.publicId ?? null,
        attachmentMimeType: body.attachment?.mimeType ?? null,
        attachmentSize: body.attachment?.size ?? null,
        attachmentName: body.attachment?.name ?? null,
        replyToId,
      },
      select: {
        id: true,
        type: true,
        text: true,
        attachmentUrl: true,
        attachmentMimeType: true,
        attachmentSize: true,
        attachmentName: true,
        isRead: true,
        editedAt: true,
        deletedAt: true,
        createdAt: true,
        senderId: true,
        replyToId: true,
        replyTo: {
          select: { id: true, text: true, senderId: true, type: true },
        },
        sender: {
          select: { name: true, avatar: true },
        },
      },
    }),
    prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageText: previewText,
        lastMessageAt: new Date(),
        lastSenderId: session.user.id,
      },
    }),
  ])

  const payload: ChatMessage = {
    id: message.id,
    type: message.type,
    text: message.text,
    attachmentUrl: message.attachmentUrl,
    attachmentMimeType: message.attachmentMimeType,
    attachmentSize: message.attachmentSize,
    attachmentName: message.attachmentName,
    isRead: message.isRead,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
    senderId: message.senderId,
    replyToId: message.replyToId,
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          text: message.replyTo.text,
          senderId: message.replyTo.senderId,
          type: message.replyTo.type,
        }
      : null,
  }

  // ─── Безпечний broadcast: помилки логуються, не падають ───

  await safeTrigger(channels.chat(chatId), events.messageNew, {
    message: payload,
    chatId,
    senderName: message.sender.name ?? '',
    senderAvatar: message.sender.avatar,
  })

  // Персональні канали інших учасників
  const otherMembers = membership.chat.members
  await Promise.all(
    otherMembers.map((m) =>
      safeTrigger(channels.user(m.userId), events.chatUpdate, {
        chatId,
        lastMessageText: previewText,
        lastMessageAt: payload.createdAt,
        lastSenderId: session.user.id,
      }),
    ),
  )

  return json({ message: payload })
}