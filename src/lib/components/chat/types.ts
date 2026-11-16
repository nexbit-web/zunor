// * SYSTEM у клієнтському контракті немає: чат — лише спілкування. У enum бази
// * значення лишилось, але не пишеться й не читається
import type { ReactionGroup } from './reactions'

export type MessageType = 'TEXT' | 'PHOTO' | 'FILE'

export type UserRole = 'CLIENT' | 'MASTER' | 'ADMIN' | 'MANAGER' | 'MODERATOR'

export interface ChatUser {
  id: string
  name: string
  avatar: string | null
  isVerified: boolean
  /**
   * Роль юзера (з бази). Є в співрозмовника в шапці чату (chat-details):
   * за нею — куди веде «Профіль» і на кого скарга. У списку чатів немає.
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

/** Превʼю посилання. `type`, а не `interface`: обʼєкт пишеться в Json-колонку Prisma. */
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
