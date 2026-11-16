// * єдине джерело правди про сповіщення: підписка на канал одна, читачів
// * багато. Лічильник — той самий у сайдбарі, меню й на сторінці сповіщень

import { browser } from '$app/environment'
import { getPusher } from '$lib/pusher-client'
import { notificationSound } from './sound.svelte'
import { showNotificationToast } from './toast'
import { isChatNotification, type Notification } from './types'

type Channel = ReturnType<ReturnType<typeof getPusher>['subscribe']>
type Listener = (n: Notification) => void

class NotificationStore {
  unreadCount = $state(0)

  #channel: Channel | null = null
  #userId: string | null = null
  #listeners = new Set<Listener>()

  /** Кличеться раз із лейауту. Початковий лічильник тягне сам — навігація не коштує запиту. */
  connect(userId: string): void {
    if (!browser || this.#userId === userId) return

    this.disconnect()
    this.#userId = userId
    void this.#loadUnreadCount()

    try {
      const pusher = getPusher()
      // * subscribe на вже відкритий канал безпечний: Pusher повертає
      // * той самий об'єкт, а bind різних подій з різних місць — штатно
      this.#channel = pusher.subscribe(`private-user-${userId}`)
      this.#channel.bind('notification:new', this.#handleIncoming)
    } catch (err) {
      console.error('[notifications] connect failed:', err)
    }
  }

  disconnect(): void {
    // * unbind, а не unsubscribe: на цьому ж каналі висить chatStore —
    // * відписка вбила б і його
    this.#channel?.unbind('notification:new', this.#handleIncoming)
    this.#channel = null
    this.#userId = null
    this.unreadCount = 0
    // * #listeners не чіпаємо: їх знімають ті, хто ставив, у своєму onMount-cleanup
  }

  /**
   * Стрічка сповіщень отримує з SSR точне число непрочитаних — воно
   * свіжіше за все, що встиг накрутити стор. Приймаємо його як істину.
   */
  setUnreadCount(count: number): void {
    this.unreadCount = Math.max(0, count)
  }

  /** Підписка на нові сповіщення для списків; повертає відписку. Власний `channel.bind` був би другою підпискою. */
  onNotification(fn: Listener): () => void {
    this.#listeners.add(fn)
    return () => this.#listeners.delete(fn)
  }

  /** Один запит за сесію: скільки непрочитаних на момент відкриття. */
  async #loadUnreadCount(): Promise<void> {
    try {
      const res = await fetch('/api/me/badges')
      if (!res.ok) return
      const data = (await res.json()) as { notifications?: number }
      // * поки запит летів, Pusher міг уже щось додати — беремо більше,
      // * щоб не загубити свіже сповіщення
      this.unreadCount = Math.max(this.unreadCount, data.notifications ?? 0)
    } catch {
      // * мовчки: лічильник лишиться на нулі й підніметься з першою подією
    }
  }

  // * стрілка, щоб зберегти this і мати ту саму посилання для unbind
  #handleIncoming = (data: { notification: Notification }): void => {
    const n = data.notification

    // * чати мають власний бейдж — у лічильник сповіщень вони не йдуть
    if (isChatNotification(n)) return

    this.unreadCount++
    for (const fn of this.#listeners) fn(n)

    notificationSound.play()
    // * перейшов за сповіщенням з острова — воно прочитане, як і в стрічці.
    // * Не вдалось — markRead сам поверне лічильник
    showNotificationToast(n, () => void this.markRead([n.id]))
  }

  /**
   * Оптимістична позначка: UI одразу, запит фоном. Не пройшов — відкат і
   * `false`. Тоста тут немає: стор не знає про UI.
   */
  async markRead(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true

    const prev = this.unreadCount
    this.unreadCount = Math.max(0, this.unreadCount - ids.length)

    const ok = await this.#post({ action: 'mark-read', ids })
    if (!ok) this.unreadCount = prev
    return ok
  }

  async markAllRead(): Promise<boolean> {
    const prev = this.unreadCount
    this.unreadCount = 0

    const ok = await this.#post({ action: 'mark-all-read' })
    if (!ok) this.unreadCount = prev
    return ok
  }

  /**
   * `unreadRemoved` — скільки з видалених були непрочитані. Знає це лише
   * той, хто тримає список, тож рахунок приходить ззовні.
   */
  async remove(ids: string[], unreadRemoved: number): Promise<boolean> {
    if (ids.length === 0) return true

    const prev = this.unreadCount
    this.unreadCount = Math.max(0, this.unreadCount - unreadRemoved)

    const ok = await this.#post({ action: 'delete', ids })
    if (!ok) this.unreadCount = prev
    return ok
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
}

export const notifications = new NotificationStore()
