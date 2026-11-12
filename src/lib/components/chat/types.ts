/**
 * SYSTEM убран из клиентского контракта: чат — только общение.
 * Заказы и их статусы в чате не показываются вообще:
 * аудит — в OrderEvent, оповещения — в колокольчике, статус — на /orders.
 *
 * В Prisma-enum значение SYSTEM физически остаётся (drop value в Postgres
 * дорогой и бессмысленный), но ни писаться, ни читаться оно больше не будет.
 */
import type { ReactionGroup } from './reactions'

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
  /** Реакції, згруповані за емодзі ($lib/components/chat/reactions). */
  reactions: ReactionGroup[]
  /** Картка першого посилання в тексті ($lib/server/link-preview). */
  linkPreview: LinkPreview | null
}

/**
 * Превʼю посилання: сайт, заголовок, опис — як у Telegram. Картинки
 * немає навмисно (чому — у $lib/server/link-preview).
 *
 * `type`, а не `interface`: обʼєкт пишеться в Json-колонку, а інтерфейс
 * Prisma як Json не приймає (немає індексної сигнатури).
 */
export type LinkPreview = {
  /** Посилання з тексту повідомлення — саме воно відкривається. */
  url: string
  siteName: string
  title: string
  description: string
}

export interface ChatPreview {
  id: string
  /** Інший учасник (для DM-чатів — single peer) */
  peer: ChatUser
  lastMessageText: string | null
  lastMessageAt: string | null
  lastSenderId: string | null
  /** До якого моменту співрозмовник прочитав — ✓✓ біля мого останнього. */
  peerLastReadAt?: string | null
  unreadCount: number
  updatedAt: string
}

export interface ChatDetails {
  id: string
  peer: ChatUser
  members: ChatUser[]
  myLastReadAt: string | null
  /**
   * До якого моменту співрозмовник прочитав чат — з нього галочки ✓✓ на
   * моїх повідомленнях. Раніше тут брався МІЙ lastReadAt, і подвійна
   * галочка після перезавантаження означала «я прочитав», а не «він».
   */
  peerLastReadAt: string | null
  /** Коли співрозмовника востаннє бачили ($lib/server/presence). */
  peerLastSeen: string | null
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
  /** Посилання змінилось чи зникло — картка теж (нова прийде окремо). */
  linkPreview?: LinkPreview | null
}

export interface MessagePreviewPayload {
  chatId: string
  messageId: string
  linkPreview: LinkPreview
}

export interface MessageDeletePayload {
  messageId: string
  chatId: string
}

export interface MessageReactionPayload {
  chatId: string
  messageId: string
  /** Повний стан реакцій після зміни — застосовується як є. */
  reactions: ReactionGroup[]
}

export interface MessageReadPayload {
  chatId: string
  readerId: string
  lastReadAt: string
}

/** chat:read — те саме, особистими каналами учасників (для списку чатів). */
export type ChatReadPayload = MessageReadPayload

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
