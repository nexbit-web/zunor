// src/lib/server/system-message.ts
import { prisma } from '$lib/prisma'
import { channels, events, safeTrigger } from './pusher'
import type { PrismaTx } from './notifications'

/**
 * Хелпер для отправки SYSTEM-сообщений в чат при событиях заказа.
 *
 * Используется в /api/orders/[id]/[action]/+server.ts после успешного
 * перехода статуса.
 */

const SYSTEM_TEMPLATES: Record<string, string> = {
  CREATED: '📝 Замовлення створено',
  STARTED: '🔧 Майстер розпочав роботу',
  COMPLETED: '🎉 Замовлення завершено',
  CANCELLED: '❌ Замовлення скасовано',
  REVIEWED: '⭐ Залишено відгук',
}

/**
 * Создаёт SYSTEM-сообщение в чате и шлёт Pusher event.
 */
export async function postOrderSystemMessage(params: {
  chatId: string
  eventType: string
  orderId: string
  actorId?: string
  extra?: string
  tx?: PrismaTx
}): Promise<void> {
  const tpl = SYSTEM_TEMPLATES[params.eventType] ?? '📌 Подія по замовленню'
  const text = params.extra ? `${tpl}\n${params.extra}` : tpl

  const db = params.tx ?? prisma

  const message = await db.message.create({
    data: {
      chatId: params.chatId,
      senderId: params.actorId ?? 'system',
      type: 'SYSTEM',
      text,
    },
    select: {
      id: true,
      type: true,
      text: true,
      createdAt: true,
      senderId: true,
      chatId: true,
    },
  })

  await db.chat.update({
    where: { id: params.chatId },
    data: {
      lastMessageText: text.slice(0, 200),
      lastMessageAt: new Date(),
      lastSenderId: params.actorId ?? 'system',
    },
  })

  // Broadcast — fail-soft
  await safeTrigger(channels.chat(params.chatId), events.messageNew, {
    message: {
      ...message,
      createdAt: message.createdAt.toISOString(),
      isRead: false,
      editedAt: null,
      deletedAt: null,
      replyToId: null,
      replyTo: null,
      attachmentUrl: null,
      attachmentMimeType: null,
      attachmentSize: null,
      attachmentName: null,
    },
  })
}
