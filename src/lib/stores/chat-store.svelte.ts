// src/lib/stores/chat-store.svelte.ts
import { browser } from '$app/environment'
import { getPusher } from '$lib/pusher-client'
import { playMessageSound } from '$lib/sound/notification'
import type {
  ChatPreview,
  MessageNewPayload,
  ChatUpdatePayload,
} from '$lib/components/chat/types'

/**
 * Глобальний store для синхронізації стану чатів між сторінками:
 *  • Бейдж "непрочитаних" у хедері і mobile-nav оновлюється у real-time
 *  • Список чатів на /messages синхронізується автоматично коли приходить
 *    повідомлення в інший чат
 *
 * Підписується на private-user-{userId} і слухає chat:update події.
 * Викликати subscribeToUserEvents(userId) один раз у root +layout.svelte.
 */

class ChatStore {
  /** Тотальний лічильник непрочитаних — для бейджа у хедері */
  totalUnread = $state(0)

  /** Список превью чатів, синхронізується з /messages */
  chats = $state<ChatPreview[]>([])

  /** Чи store ініціалізований (через subscribe) */
  initialized = $state(false)

  /** ID юзера якого ми слухаємо (щоб не підписатися двічі) */
  private boundUserId: string | null = null

  /** ID активно відкритого чату — щоб не звукувати на нього */
  activeChatId = $state<string | null>(null)

  /** Підраховує totalUnread за список чатів */
  recomputeUnread() {
    this.totalUnread = this.chats.reduce((sum, c) => sum + c.unreadCount, 0)
  }

  /** Викликається коли /messages вантажить початковий список */
  setChats(chats: ChatPreview[]) {
    this.chats = chats
    this.recomputeUnread()
    this.initialized = true
  }

  /** Локально позначити чат як прочитаний (коли юзер його відкриває) */
  markChatRead(chatId: string) {
    const chat = this.chats.find((c) => c.id === chatId)
    if (chat && chat.unreadCount > 0) {
      chat.unreadCount = 0
      this.recomputeUnread()
    }
  }

  /** Підписатися на персональний канал юзера для real-time оновлень */
  async subscribeToUserEvents(userId: string) {
    if (!browser) return
    if (this.boundUserId === userId) return

    const pusher = getPusher()
    const channelName = `private-user-${userId}`
    const channel = pusher.subscribe(channelName)

    // Прийшло нове/інше оновлення в чаті — оновлюємо preview і unread
    channel.bind('chat:update', (data: ChatUpdatePayload) => {
      this.handleChatUpdate(data, userId)
    })

    // Деталь повідомлення (для звуку коли чат закритий)
    channel.bind('message:new', (data: MessageNewPayload) => {
      this.handleIncomingMessage(data, userId)
    })

    this.boundUserId = userId
  }

  /** Cleanup при logout */
  unsubscribeAll() {
    if (!browser || !this.boundUserId) return
    const pusher = getPusher()
    pusher.unsubscribe(`private-user-${this.boundUserId}`)
    this.boundUserId = null
    this.chats = []
    this.totalUnread = 0
    this.initialized = false
  }

  private handleChatUpdate(data: ChatUpdatePayload, currentUserId: string) {
    const chat = this.chats.find((c) => c.id === data.chatId)
    if (!chat) {
      // Невідомий чат — можливо щойно створений, перезавантажимо весь список
      this.refreshChats()
      return
    }

    chat.lastMessageText = data.lastMessageText
    chat.lastMessageAt = data.lastMessageAt
    chat.lastSenderId = data.lastSenderId

    // Інкрементуємо unread якщо повідомлення не від мене
    // і чат не відкритий зараз
    const isFromOther =
      data.lastSenderId && data.lastSenderId !== currentUserId
    const isActiveChat = this.activeChatId === data.chatId

    if (isFromOther && !isActiveChat) {
      chat.unreadCount += 1
    }

    // Переміщаємо чат на верх списку
    this.chats = [chat, ...this.chats.filter((c) => c.id !== data.chatId)]
    this.recomputeUnread()
  }

  private handleIncomingMessage(
    data: MessageNewPayload,
    currentUserId: string,
  ) {
    if (data.message.senderId === currentUserId) return
    // Звук — тільки якщо чат не активний (інакше chat-window сам звукує)
    if (this.activeChatId !== data.chatId) {
      playMessageSound()
      this.tryShowBrowserNotification(data)
    }
  }

  private async refreshChats() {
    try {
      const res = await fetch('/api/chats')
      if (!res.ok) return
      const json = await res.json()
      this.setChats(json.chats ?? [])
    } catch {
      // ignore
    }
  }

  /** Browser push-сповіщення (якщо юзер дозволив) */
  private tryShowBrowserNotification(data: MessageNewPayload) {
    if (!browser) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return
    if (document.visibilityState === 'visible') return // вкладка активна — не треба

    const text =
      data.message.type === 'TEXT'
        ? data.message.text
        : data.message.type === 'PHOTO'
          ? '📷 Фото'
          : '📎 Файл'

    const notif = new Notification(data.senderName || 'Нове повідомлення', {
      body: text.slice(0, 140),
      icon: data.senderAvatar ?? '/favicon.svg',
      tag: `chat-${data.chatId}`, // замінює попереднє з того ж чату
    })

    notif.onclick = () => {
      window.focus()
      window.location.href = `/messages/${data.chatId}`
      notif.close()
    }
  }
}

export const chatStore = new ChatStore()

/**
 * Запросити дозвіл на browser-сповіщення (показати prompt).
 * Викликати з кліку, бо deny без user gesture.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!browser) return false
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}