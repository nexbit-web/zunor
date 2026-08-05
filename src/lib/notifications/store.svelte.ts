// Єдине джерело правди про сповіщення.
//
// Раніше стан жив у трьох місцях: список у user-menu, лічильник
// у сайдбарі, тост у окремому компоненті — кожен зі своєю підпискою
// на той самий Pusher-канал. Тепер підписка одна, читачів багато.

import { browser } from '$app/environment'
import toast from 'svelte-hot-french-toast'
import { getPusher } from '$lib/pusher-client'
import { notificationSound } from './sound.svelte'
import { showNotificationToast } from './toast'
import { isChatNotification, type Notification } from './types'

const FEED_LIMIT = 6

type Channel = ReturnType<ReturnType<typeof getPusher>['subscribe']>

class NotificationStore {
  /** Останні сповіщення для випадайки в хедері. */
  items = $state<Notification[]>([])
  unreadCount = $state(0)

  #channel: Channel | null = null
  #userId: string | null = null

  /**
   * Викликається один раз із <NotificationsListener /> у layout.
   *
   * Початковий лічильник тягнемо з сервера самі, а не отримуємо з даних
   * лейауту: інакше кожна навігація коштувала б запиту до БД заради числа,
   * яке далі однаково оновлює Pusher.
   */
  connect(userId: string): void {
    if (!browser || this.#userId === userId) return

    this.disconnect()
    this.#userId = userId
    void this.#loadUnreadCount()

    try {
      const pusher = getPusher()
      // subscribe на вже відкритий канал безпечний: Pusher повертає
      // той самий об'єкт, а bind різних подій з різних місць — штатно.
      this.#channel = pusher.subscribe(`private-user-${userId}`)
      this.#channel.bind('notification:new', this.#handleIncoming)
    } catch (err) {
      console.error('[notifications] connect failed:', err)
    }
  }

  disconnect(): void {
    // unbind, а не unsubscribe: на цьому ж каналі висить chatStore —
    // відписка вбила б і його.
    this.#channel?.unbind('notification:new', this.#handleIncoming)
    this.#channel = null
    this.#userId = null
    this.items = []
    this.unreadCount = 0
  }

  /** Один запит за сесію: скільки непрочитаних на момент відкриття. */
  async #loadUnreadCount(): Promise<void> {
    try {
      const res = await fetch('/api/me/badges')
      if (!res.ok) return
      const data = (await res.json()) as { notifications?: number }
      // Поки запит летів, Pusher міг уже щось додати — беремо більше,
      // щоб не загубити свіже сповіщення.
      this.unreadCount = Math.max(this.unreadCount, data.notifications ?? 0)
    } catch {
      // Мовчки: лічильник лишиться на нулі й підніметься з першою подією.
    }
  }

  // Стрілка, щоб зберегти this і мати ту саму посилання для unbind.
  #handleIncoming = (data: { notification: Notification }): void => {
    const n = data.notification

    this.items = [n, ...this.items].slice(0, FEED_LIMIT)
    this.unreadCount++

    if (isChatNotification(n)) return

    notificationSound.play()
    showNotificationToast(n)
  }

  /**
   * Оптимістична позначка: UI оновлюється миттєво, запит іде фоном.
   *
   * Якщо запит не пройшов — вертаємо як було. Раніше збій ковтався
   * мовчки: бейдж гаснув, у базі непрочитане лишалось, і воно поверталось
   * при наступному завантаженні сторінки нізвідки. Інтерфейс не має
   * показувати те, чого на сервері не сталось.
   */
  async markRead(id: string): Promise<void> {
    const prevItems = this.items
    const prevCount = this.unreadCount

    this.items = this.items.map((n) =>
      n.id === id ? { ...n, isRead: true } : n,
    )
    this.unreadCount = Math.max(0, this.unreadCount - 1)

    if (!(await this.#post({ action: 'mark-read', ids: [id] }))) {
      this.items = prevItems
      this.unreadCount = prevCount
    }
  }

  async markAllRead(): Promise<void> {
    const prevItems = this.items
    const prevCount = this.unreadCount

    this.items = this.items.map((n) => ({ ...n, isRead: true }))
    this.unreadCount = 0

    if (!(await this.#post({ action: 'mark-all-read' }))) {
      this.items = prevItems
      this.unreadCount = prevCount
      toast.error('Не вдалося позначити прочитаними')
    }
  }

  /** true — сервер прийняв. Мережеві збої не кидають назовні. */
  async #post(body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return res.ok
    } catch {
      return false
    }
  }

  /** Підвантаження стрічки при відкритті випадайки. */
  async load(): Promise<void> {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = (await res.json()) as { notifications?: Notification[] }
      if (data.notifications)
        this.items = data.notifications.slice(0, FEED_LIMIT)
    } catch {
      // Мовчки: стрічка лишиться з тим, що прийшло через Pusher.
    }
  }
}

export const notifications = new NotificationStore()
