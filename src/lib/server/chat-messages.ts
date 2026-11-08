// Повідомлення чату: що читаємо з бази й як віддаємо в браузер.
//
// Одне місце на три шляхи — сторінку чату, догрузку старіших
// (GET /api/chats/[id]/messages) і щойно надіслане (POST). Коли select і
// перетворення жили в кожному окремо, нове поле доводилось дописувати
// тричі, і рано чи пізно одна з копій відставала.

import type { Prisma } from '../../generated/prisma/client'
import { groupReactions } from '$lib/components/chat/reactions'
import type {
  ChatMessage,
  LinkPreview,
  MessageType,
} from '$lib/components/chat/types'

export const MESSAGE_SELECT = {
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
    select: {
      id: true,
      text: true,
      senderId: true,
      type: true,
      deletedAt: true,
    },
  },
  reactions: {
    select: { emoji: true, userId: true },
    orderBy: { createdAt: 'asc' },
  },
  linkPreview: true,
} satisfies Prisma.MessageSelect

type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>

const str = (v: unknown): v is string => typeof v === 'string'

/**
 * Картка з Json-колонки. Колонка — не контракт: що б там не лежало
 * (ручна правка, стара форма), у браузер їде або повна картка, або null.
 */
export function toLinkPreview(raw: unknown): LinkPreview | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const p = raw as Record<string, unknown>
  if (!str(p.url) || !/^https?:\/\//i.test(p.url)) return null
  if (!str(p.siteName) || !str(p.title) || !str(p.description)) return null
  return {
    url: p.url,
    siteName: p.siteName,
    title: p.title,
    description: p.description,
  }
}

export function toChatMessage(m: MessageRow): ChatMessage {
  const deleted = !!m.deletedAt
  return {
    id: m.id,
    type: m.type as MessageType,
    // Видалене не віддаємо навіть у JSON: «видалено» має означати
    // «немає», а не «сховано в інтерфейсі».
    text: deleted ? '' : m.text,
    attachmentUrl: deleted ? null : m.attachmentUrl,
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
          // Те саме для цитати: видалене повідомлення не має жити далі в
          // тексті відповіді на нього.
          text: m.replyTo.deletedAt ? '' : m.replyTo.text,
          senderId: m.replyTo.senderId,
          type: m.replyTo.type as MessageType,
        }
      : null,
    reactions: deleted ? [] : groupReactions(m.reactions),
    linkPreview: deleted ? null : toLinkPreview(m.linkPreview),
  }
}
