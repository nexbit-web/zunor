// src/lib/components/chat/types.ts

/**
 * SYSTEM убран из клиентского контракта: чат — только общение.
 * Заказы и их статусы в чате не показываются вообще:
 * аудит — в OrderEvent, оповещения — в колокольчике, статус — на /orders.
 *
 * В Prisma-enum значение SYSTEM физически остаётся (drop value в Postgres
 * дорогой и бессмысленный), но ни писаться, ни читаться оно больше не будет.
 */
export type MessageType = 'TEXT' | 'PHOTO' | 'FILE'

export type UserRole = 'CLIENT' | 'FREELANCER' | 'ADMIN'

export interface ChatUser {
  id: string
  name: string
  username: string | null
  avatar: string | null
  isVerified: boolean
  /**
   * Роль юзера. Опціонально — старі чати можуть не мати цього поля.
   * Використовується для визначення чи показувати кнопку "Створити замовлення"
   * (доступна тільки клієнту по відношенню до фрілансера).
   */
  role?: UserRole
}

export interface ChatMessage {
  id: string
  type: MessageType
  text: string
  attachmentUrl: string | null
  attachmentMimeType: string | null
  attachmentSize: number | null
  attachmentName: string | null
  isRead: boolean
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
  senderId: string
  replyToId: string | null
  replyTo: {
    id: string
    text: string
    senderId: string
    type: MessageType
  } | null
}

export interface ChatPreview {
  id: string
  /** Інший учасник (для DM-чатів — single peer) */
  peer: ChatUser
  lastMessageText: string | null
  lastMessageAt: string | null
  lastSenderId: string | null
  unreadCount: number
  updatedAt: string
}

export interface ChatDetails {
  id: string
  peer: ChatUser
  members: ChatUser[]
  myLastReadAt: string | null
  mutedUntil: string | null
}

// ─── Pusher payloads ───

export interface MessageNewPayload {
  message: ChatMessage
  chatId: string
  senderName: string
  senderAvatar: string | null
}

export interface MessageEditPayload {
  messageId: string
  chatId: string
  text: string
  editedAt: string
}

export interface MessageDeletePayload {
  messageId: string
  chatId: string
}

export interface MessageReadPayload {
  chatId: string
  readerId: string
  lastReadAt: string
}

export interface ChatUpdatePayload {
  chatId: string
  lastMessageText: string
  lastMessageAt: string
  lastSenderId: string
  unreadCount: number
}

export interface TypingPayload {
  userId: string
  userName: string
}