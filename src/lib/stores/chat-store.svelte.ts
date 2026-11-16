import { browser } from '$app/environment'
import { getPusher } from '$lib/pusher-client'
import { playMessageSound } from '$lib/sound/notification'
import type {
  ChatPreview,
  ChatReadPayload,
  MessageNewPayload,
  ChatUpdatePayload,
} from '$lib/components/chat/types'

/**
 * Стан чатів між сторінками: бейдж непрочитаних і список на /messages.
 * Слухає private-user-{userId}: chat:update (нове повідомлення) і chat:read.
 * subscribeToUserEvents(userId) кличеться раз у кореневому лейауті.
 */

type Channel = ReturnType<ReturnType<typeof getPusher>['subscribe']>

class ChatStore {
  /** Список превью чатів, синхронізується з /messages */
  chats = $state<ChatPreview[]>([])

  /** Усі непрочитані — для бейджа. $derived: похідне не може розійтися з джерелом. */
  totalUnread = $derived(this.chats.reduce((sum, c) => sum + c.unreadCount, 0))

  /** Чи store ініціалізований (через subscribe) */
  initialized = $state(false)

  /** ID юзера якого ми слухаємо (щоб не підписатися двічі) */
  private boundUserId: string | null = null

  // * канал і посилання на обробники тримаємо, щоб було ЩО знімати.
  // * Інлайнові стрілки в bind не дають цієї можливості: unbind без тієї
  // * самої посилки не знімає нічого
  private channel: Channel | null = null
  private onChatUpdate: ((data: ChatUpdatePayload) => void) | null = null
  private onMessageNew: ((data: MessageNewPayload) => void) | null = null
  private onChatRead: ((data: ChatReadPayload) => void) | null = null

  /** ID активно відкритого чату — щоб не звукувати на нього */
  activeChatId = $state<string | null>(null)

  /** Викликається коли /messages вантажить початковий список */
  setChats(chats: ChatPreview[]) {
    this.chats = chats
    this.initialized = true
  }

  /**
   * Співрозмовник прочитав чат (подія message:read у відкритому вікні) —
   * галочки в списку стають подвійними без перезавантаження.
   */
  markPeerRead(chatId: string, lastReadAt: string) {
    const chat = this.chats.find((c) => c.id === chatId)
    if (!chat) return
    // * події можуть прийти не по черзі — межа прочитаного назад не їде
    if (chat.peerLastReadAt && chat.peerLastReadAt > lastReadAt) return
    chat.peerLastReadAt = lastReadAt
  }

  /** Локально позначити чат як прочитаний (коли юзер його відкриває) */
  markChatRead(chatId: string) {
    const chat = this.chats.find((c) => c.id === chatId)
    if (chat && chat.unreadCount > 0) chat.unreadCount = 0
  }

  /** Підписатися на персональний канал юзера для real-time оновлень */
  async subscribeToUserEvents(userId: string) {
    if (!browser) return
    if (this.boundUserId === userId) return

    // * зміна користувача: старі обробники треба зняти, інакше вони
    // * залишаться висіти на попередньому каналі назавжди
    this.unbindChannel()

    const pusher = getPusher()
    const channelName = `private-user-${userId}`
    const channel = pusher.subscribe(channelName)

    // * прийшло нове/інше оновлення в чаті — оновлюємо preview і unread
    this.onChatUpdate = (data: ChatUpdatePayload) => {
      this.handleChatUpdate(data, userId)
    }
    // * деталь повідомлення (для звуку коли чат закритий)
    this.onMessageNew = (data: MessageNewPayload) => {
      this.handleIncomingMessage(data, userId)
    }

    // * прочитали чат (подія сервера з api/chats/[id]/read). Чат закритий
    // * — інакше то саме приносить message:read у вікні розмови
    this.onChatRead = (data: ChatReadPayload) => {
      if (data.readerId === userId) this.markReadElsewhere(data)
      else this.markPeerRead(data.chatId, data.lastReadAt)
    }

    channel.bind('chat:update', this.onChatUpdate)
    channel.bind('message:new', this.onMessageNew)
    channel.bind('chat:read', this.onChatRead)

    this.channel = channel
    this.boundUserId = userId
  }

  /** Cleanup при logout */
  unsubscribeAll() {
    if (!browser || !this.boundUserId) return

    this.unbindChannel()
    this.boundUserId = null
    this.chats = [] // totalUnread похідний — обнулиться сам
    this.initialized = false
  }

  /** Знімає лише свої обробники (unbind): на цьому ж каналі висить стор сповіщень. */
  private unbindChannel() {
    if (this.onChatUpdate)
      this.channel?.unbind('chat:update', this.onChatUpdate)
    if (this.onMessageNew)
      this.channel?.unbind('message:new', this.onMessageNew)
    if (this.onChatRead) this.channel?.unbind('chat:read', this.onChatRead)

    this.channel = null
    this.onChatUpdate = null
    this.onMessageNew = null
    this.onChatRead = null
  }

  /**
   * Людина прочитала чат на іншому пристрої (телефон, друга вкладка) —
   * лічильник гасне й тут. Якщо після прочитаного вже прийшло нове
   * повідомлення, лічильник лишаємо: воно ще не прочитане.
   */
  private markReadElsewhere({ chatId, lastReadAt }: ChatReadPayload) {
    const chat = this.chats.find((c) => c.id === chatId)
    if (!chat || chat.unreadCount === 0) return
    if (chat.lastMessageAt && chat.lastMessageAt > lastReadAt) return
    chat.unreadCount = 0
  }

  private handleChatUpdate(data: ChatUpdatePayload, currentUserId: string) {
    const chat = this.chats.find((c) => c.id === data.chatId)
    if (!chat) {
      // * невідомий чат — можливо щойно створений, перезавантажимо весь список
      this.refreshChats()
      return
    }

    chat.lastMessageText = data.lastMessageText
    chat.lastMessageAt = data.lastMessageAt
    chat.lastSenderId = data.lastSenderId

    // * інкрементуємо unread якщо повідомлення не від мене
    // * і чат не відкритий зараз
    const isFromOther = data.lastSenderId && data.lastSenderId !== currentUserId
    const isActiveChat = this.activeChatId === data.chatId

    if (isFromOther && !isActiveChat) {
      chat.unreadCount += 1
    }

    // * переміщаємо чат на верх списку
    this.chats = [chat, ...this.chats.filter((c) => c.id !== data.chatId)]
  }

  private handleIncomingMessage(
    data: MessageNewPayload,
    currentUserId: string,
  ) {
    if (data.message.senderId === currentUserId) return
    // * звук — тільки якщо чат не активний (інакше chat-window сам звукує)
    if (this.activeChatId !== data.chatId) {
      playMessageSound()
      this.tryShowBrowserNotification(data)
    }
  }

  /** Тягне список чатів із сервера: один запит за сесію, далі стор живе на подіях. */
  async refreshChats(): Promise<void> {
    try {
      const res = await fetch('/api/chats')
      if (!res.ok) return
      const json = await res.json()
      this.setChats(json.chats ?? [])
    } catch {
      // * ignore: без списку бейдж просто лишиться порожнім
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
      window.location.href = `/dashboard/messages/${data.chatId}`
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
