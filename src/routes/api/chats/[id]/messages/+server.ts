import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import { channels, events, safeTrigger } from '$lib/server/pusher'
import { limit } from '$lib/server/rate-limit'
import { MESSAGE_SELECT, toChatMessage } from '$lib/server/chat-messages'
import {
  attachLinkPreview,
  linkPreviewColumn,
  planLinkPreview,
} from '$lib/server/chat-link-preview'
import type { RequestHandler } from './$types'
import { background } from '$lib/server/background'

const MESSAGE_PAGE_SIZE = 50
const MAX_TEXT_LENGTH = 4000

const ALLOWED_TYPES = ['TEXT', 'PHOTO', 'FILE'] as const
type AllowedType = (typeof ALLOWED_TYPES)[number]

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const MAX_ATTACHMENT_NAME = 255

export const GET: RequestHandler = async ({ params, url, locals }) => {
  const user = requireApiUser(locals)

  const chatId = params.id
  const cursor = url.searchParams.get('cursor')

  const membership = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId: user.id } },
    select: { id: true },
  })
  if (!membership) throw error(403, 'Not a member')

  const messages = await prisma.message.findMany({
    // type != SYSTEM — legacy-рядки не показуємо навіть якщо міграцію
    // ще не накотили.
    where: { chatId, type: { not: 'SYSTEM' } },
    orderBy: { createdAt: 'desc' },
    take: MESSAGE_PAGE_SIZE + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    select: MESSAGE_SELECT,
  })

  const hasMore = messages.length > MESSAGE_PAGE_SIZE
  const items = hasMore ? messages.slice(0, MESSAGE_PAGE_SIZE) : messages
  const nextCursor = hasMore ? items[items.length - 1].id : null

  return json({ messages: items.map(toChatMessage), nextCursor })
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = requireApiUser(locals)

  const rl = await limit(`msg:${user.id}`, {
    points: 60,
    duration: 60_000,
  })
  if (!rl.success) throw error(429, 'Too many messages')

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') throw error(400, 'Invalid JSON')

  // ─── Валідація типу ───
  const rawType = (body as { type?: unknown }).type ?? 'TEXT'
  if (!ALLOWED_TYPES.includes(rawType as AllowedType)) {
    throw error(400, 'Невідомий тип повідомлення')
  }
  const type = rawType as AllowedType

  const text = String((body as { text?: unknown }).text ?? '').trim()
  const rawReplyToId = (body as { replyToId?: unknown }).replyToId
  const replyToId =
    typeof rawReplyToId === 'string' && rawReplyToId ? rawReplyToId : null

  if (type === 'TEXT' && !text) throw error(400, 'Text required')
  if (text.length > MAX_TEXT_LENGTH) throw error(400, 'Text too long')

  // ─── Валідація вкладення ───
  const rawAttachment = (body as { attachment?: unknown }).attachment
  const attachment =
    rawAttachment && typeof rawAttachment === 'object'
      ? (rawAttachment as {
          url?: unknown
          publicId?: unknown
          mimeType?: unknown
          size?: unknown
          name?: unknown
        })
      : null

  if ((type === 'PHOTO' || type === 'FILE') && !attachment?.url) {
    throw error(400, 'Attachment required')
  }

  let attachmentUrl: string | null = null
  let attachmentPublicId: string | null = null
  let attachmentMimeType: string | null = null
  let attachmentSize: number | null = null
  let attachmentName: string | null = null

  if (attachment?.url) {
    // Приймаємо тільки те, що реально завантажено через нашу підписану форму.
    if (
      typeof attachment.url !== 'string' ||
      !attachment.url.startsWith('https://res.cloudinary.com/')
    ) {
      throw error(400, 'Недопустиме посилання на файл')
    }
    attachmentUrl = attachment.url
    attachmentPublicId =
      typeof attachment.publicId === 'string'
        ? attachment.publicId.slice(0, 300)
        : null
    attachmentMimeType =
      typeof attachment.mimeType === 'string'
        ? attachment.mimeType.slice(0, 120)
        : null
    attachmentSize =
      typeof attachment.size === 'number' &&
      Number.isFinite(attachment.size) &&
      attachment.size > 0 &&
      attachment.size <= MAX_ATTACHMENT_BYTES
        ? Math.trunc(attachment.size)
        : null
    attachmentName =
      typeof attachment.name === 'string'
        ? attachment.name.slice(0, MAX_ATTACHMENT_NAME)
        : null
  }

  const chatId = params.id

  const membership = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId: user.id } },
    select: {
      chat: {
        select: {
          members: {
            where: { userId: { not: user.id } },
            select: { userId: true },
          },
        },
      },
    },
  })
  if (!membership) throw error(403, 'Not a member')

  // Відповідати можна лише на повідомлення цього ж чату.
  // Без цієї перевірки reply на чужий messageId повертав би у відповіді
  // текст повідомлення з чату, до якого юзер не має доступу.
  if (replyToId) {
    const parent = await prisma.message.findFirst({
      where: { id: replyToId, chatId },
      select: { id: true },
    })
    if (!parent) throw error(400, 'Невірне повідомлення для відповіді')
  }

  const previewText =
    type === 'TEXT'
      ? text.slice(0, 200)
      : type === 'PHOTO'
        ? '📷 Фото'
        : '📎 Файл'

  // Картка посилання — лише в тексті (підпис до фото її не має, як у
  // Telegram). Відома з кешу пишеться одразу, невідома — після відповіді.
  const linkPreview =
    type === 'TEXT' ? planLinkPreview(text) : { value: null, fetchLater: false }

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        chatId,
        senderId: user.id,
        type,
        text,
        attachmentUrl,
        attachmentPublicId,
        attachmentMimeType,
        attachmentSize,
        attachmentName,
        replyToId,
        linkPreview: linkPreviewColumn(linkPreview.value),
      },
      select: {
        ...MESSAGE_SELECT,
        sender: { select: { name: true, avatar: true } },
      },
    }),
    prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageText: previewText,
        lastMessageAt: new Date(),
        lastSenderId: user.id,
      },
    }),
  ])

  const payload = toChatMessage(message)

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
        lastSenderId: user.id,
      }),
    ),
  )

  // Без await: сторонній сайт не має тримати відправку.
  if (linkPreview.fetchLater)
    background(attachLinkPreview(chatId, message.id, text), 'link preview')

  return json({ message: payload })
}
