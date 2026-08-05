// Єдине джерело правди про сповіщення.
//
// Раніше стан жив у трьох місцях: список у user-menu, лічильник
// у сайдбарі, тост у окремому компоненті — кожен зі своєю підпискою
// на той самий Pusher-канал. Тепер підписка одна, читачів багато.
//
// Лічильник тут — той самий, що світиться в сайдбарі, нижньому меню й
// мобільному меню. Сторінка /dashboard/notifications НЕ тримає власного:
// доки тримала, прочитане на сторінці не гасило бейдж у сайдбарі, бо це
// були два різні числа, які ніхто не зводив.

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
    this.unreadCount = 0
    // #listeners не чіпаємо: їх знімають ті, хто ставив, у своєму onMount-cleanup.
  }

  /**
   * Стрічка сповіщень отримує з SSR точне число непрочитаних — воно
   * свіжіше за все, що встиг накрутити стор. Приймаємо його як істину.
   */
  setUnreadCount(count: number): void {
    this.unreadCount = Math.max(0, count)
  }

  /**
   * Підписка на нові сповіщення для тих, хто показує їх списком.
   * Повертає функцію відписки — саме її треба повернути з onMount.
   *
   * Потрібна, бо власний `channel.bind` на сторінці означав би другу
   * підписку на ту саму подію (і саме там був живий баг: сторінка слухала
   * подію 'notification', а сервер шле 'notification:new', тож стрічка
   * не оновлювалась наживо взагалі).
   */
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

    // Чати мають власний бейдж — у лічильник сповіщень вони не йдуть.
    if (isChatNotification(n)) return

    this.unreadCount++
    for (const fn of this.#listeners) fn(n)

    notificationSound.play()
    showNotificationToast(n)
  }

  /**
   * Оптимістична позначка: UI оновлюється миттєво, запит іде фоном.
   *
   * Якщо запит не пройшов — вертаємо як було, і кажемо про це викликачу
   * через `false`. Раніше збій ковтався мовчки: бейдж гаснув, у базі
   * непрочитане лишалось, і воно поверталось при наступному завантаженні
   * сторінки нізвідки. Інтерфейс не має показувати те, чого на сервері
   * не сталось.
   *
   * Тост тут не показуємо навмисно: стор не має знати про UI-бібліотеку,
   * а сторінка все одно вирішує це разом із відкотом власного списку.
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
