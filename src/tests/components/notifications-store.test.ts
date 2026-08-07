import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getPusher,
  pusher,
  emit,
  handlerCount,
  resetPusher,
  installFetch,
  fetchMock,
  respondWith,
  respondFail,
  respondOffline,
  lastPostBody,
} from './helpers/client-infra'
import type { Notification } from '$lib/notifications/types'

const sound = vi.hoisted(() => ({ play: vi.fn(), enabled: true }))
const showNotificationToast = vi.hoisted(() => vi.fn())

vi.mock('$lib/pusher-client', () => ({ getPusher }))
vi.mock('$lib/notifications/sound.svelte', () => ({
  notificationSound: sound,
}))
vi.mock('$lib/notifications/toast', () => ({ showNotificationToast }))

const { notifications } = await import('$lib/notifications/store.svelte')

// Єдине джерело правди про сповіщення. Раніше стан жив у трьох місцях зі
// своєю підпискою в кожному — і вони встигли розійтись. Тому тут тримаються
// саме ті властивості, через які їх і звели в один стор:
//
//   • одна підписка на подію, а не по одній на кожного читача;
//   • disconnect робить unbind, а НЕ unsubscribe: на тому ж каналі висить
//     chatStore, і відписка вбила б і його;
//   • ім'я події звіряється з рядком-літералом — саме тут був живий баг
//     ('notification' проти 'notification:new'), через який стрічка не
//     оновлювалась наживо взагалі;
//   • оптимістичне оновлення відкочується: інтерфейс не має показувати
//     те, чого на сервері не сталось.

const USER = 'user-1'
const CHANNEL = 'private-user-user-1'

function notification(over: Partial<Notification> = {}): Notification {
  return {
    id: 'n-1',
    type: 'NEW_PROPOSAL',
    title: 'Майстер відгукнувся',
    isRead: false,
    createdAt: '2026-03-15T12:00:00.000Z',
    jobId: 'job-1',
    ...over,
  }
}

/** Надіслати сповіщення так, ніби воно прийшло з сервера. */
const incoming = (over: Partial<Notification> = {}) =>
  emit(CHANNEL, 'notification:new', { notification: notification(over) })

beforeEach(() => {
  resetPusher()
  installFetch()
  sound.play.mockClear()
  showNotificationToast.mockClear()
  notifications.disconnect()
})

describe('підписка', () => {
  it('підписується на особистий канал користувача', () => {
    notifications.connect(USER)

    expect(pusher.subscribe).toHaveBeenCalledWith(CHANNEL)
  })

  // Рядок-літерал навмисно: константа з мока «підтвердила» б будь-яке
  // перейменування, а фронт мовчки перестав би оновлюватись.
  it('слухає саме notification:new', () => {
    notifications.connect(USER)

    expect(handlerCount(CHANNEL, 'notification:new')).toBe(1)
  })

  it('повторний connect того самого юзера не подвоює підписку', () => {
    notifications.connect(USER)
    notifications.connect(USER)
    notifications.connect(USER)

    expect(handlerCount(CHANNEL, 'notification:new')).toBe(1)
  })

  it('зміна користувача знімає стару підписку', () => {
    notifications.connect(USER)
    notifications.connect('user-2')

    expect(handlerCount(CHANNEL, 'notification:new')).toBe(0)
    expect(handlerCount('private-user-user-2', 'notification:new')).toBe(1)
  })

  // Ключова деталь: канал спільний з chatStore. unsubscribe тут вимкнув би
  // і чати — тому саме unbind.
  it('відключення знімає лише свій обробник, канал лишає живим', () => {
    notifications.connect(USER)
    notifications.disconnect()

    expect(pusher.unsubscribe).not.toHaveBeenCalled()
  })

  it('відключення обнуляє лічильник', () => {
    notifications.connect(USER)
    notifications.setUnreadCount(5)

    notifications.disconnect()

    expect(notifications.unreadCount).toBe(0)
  })

  // Pusher може не піднятись (немає ключа, немає мережі) — сторінка від
  // цього падати не має.
  it('падіння Pusher не роняє застосунок', () => {
    getPusher.mockImplementationOnce(() => {
      throw new Error('no pusher key')
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => notifications.connect(USER)).not.toThrow()

    err.mockRestore()
  })
})

describe('початковий лічильник', () => {
  it('тягнеться одним запитом, а не з даних лейауту', async () => {
    respondWith({ notifications: 3 })

    notifications.connect(USER)
    await vi.waitFor(() => expect(notifications.unreadCount).toBe(3))

    expect(fetchMock).toHaveBeenCalledWith('/api/me/badges')
  })

  // Поки летів запит, Pusher міг уже щось додати — інакше свіже сповіщення
  // затерлося б старим числом із сервера.
  it('подія, що прилетіла під час запиту, не губиться', async () => {
    respondWith({ notifications: 2 })

    notifications.connect(USER)
    incoming({ id: 'n-fresh' })

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await vi.waitFor(() => expect(notifications.unreadCount).toBe(2))
  })

  it('помилка сервера лишає нуль і не кидає', async () => {
    respondFail(500)

    notifications.connect(USER)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

    expect(notifications.unreadCount).toBe(0)
  })

  it('немає мережі — теж мовчки нуль', async () => {
    respondOffline()

    notifications.connect(USER)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

    expect(notifications.unreadCount).toBe(0)
  })
})

describe('вхідне сповіщення', () => {
  beforeEach(() => {
    notifications.connect(USER)
    notifications.setUnreadCount(0)
  })

  it('піднімає лічильник, звучить і показує тост', () => {
    incoming()

    expect(notifications.unreadCount).toBe(1)
    expect(sound.play).toHaveBeenCalledTimes(1)
    expect(showNotificationToast).toHaveBeenCalledTimes(1)
  })

  // У чатів свій бейдж і свій звук — інакше одне повідомлення рахувалося б
  // двічі й дзвеніло двічі.
  it('чатове сповіщення проходить повз лічильник, звук і тост', () => {
    incoming({ type: 'NEW_MESSAGE' })

    expect(notifications.unreadCount).toBe(0)
    expect(sound.play).not.toHaveBeenCalled()
    expect(showNotificationToast).not.toHaveBeenCalled()
  })

  it('кілька сповіщень підряд рахуються всі', () => {
    incoming({ id: 'a' })
    incoming({ id: 'b' })
    incoming({ id: 'c' })

    expect(notifications.unreadCount).toBe(3)
  })

  it('у тост їде саме те сповіщення, що прийшло', () => {
    incoming({ id: 'n-9', title: 'Тебе обрали' })

    expect(showNotificationToast.mock.calls[0][0]).toMatchObject({
      id: 'n-9',
      title: 'Тебе обрали',
    })
  })
})

describe('підписники стрічки', () => {
  beforeEach(() => {
    notifications.connect(USER)
  })

  // Сторінка сповіщень НЕ робить власного channel.bind: друга підписка вже
  // одного разу розійшлась із сервером по імені події й мовчки не працювала.
  it('усі підписники отримують нове сповіщення', () => {
    const a = vi.fn()
    const b = vi.fn()
    notifications.onNotification(a)
    notifications.onNotification(b)

    incoming({ id: 'n-7' })

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    expect(a.mock.calls[0][0].id).toBe('n-7')
  })

  it('повернена функція знімає підписку', () => {
    const fn = vi.fn()
    const off = notifications.onNotification(fn)

    off()
    incoming()

    expect(fn).not.toHaveBeenCalled()
  })

  it('чатове сповіщення підписникам не йде', () => {
    const fn = vi.fn()
    notifications.onNotification(fn)

    incoming({ type: 'NEW_MESSAGE' })

    expect(fn).not.toHaveBeenCalled()
  })

  it('відключення не зриває підписки читачів — їх знімають самі читачі', () => {
    const fn = vi.fn()
    notifications.onNotification(fn)

    notifications.disconnect()
    notifications.connect(USER)
    incoming()

    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('лічильник і SSR', () => {
  it('точне число з сервера приймається як істина', () => {
    notifications.setUnreadCount(12)

    expect(notifications.unreadCount).toBe(12)
  })

  // Мінус у бейджі виглядав би як поламаний застосунок.
  it('відʼємне число не проходить', () => {
    notifications.setUnreadCount(-5)

    expect(notifications.unreadCount).toBe(0)
  })
})

describe('позначити прочитаним', () => {
  beforeEach(() => {
    notifications.setUnreadCount(5)
  })

  it('лічильник падає одразу, не чекаючи сервера', async () => {
    const promise = notifications.markRead(['a', 'b'])

    expect(notifications.unreadCount).toBe(3)
    await promise
  })

  it('на сервер їде дія і список id', async () => {
    await notifications.markRead(['a', 'b'])

    expect(fetchMock.mock.calls[0][0]).toBe('/api/notifications')
    expect(lastPostBody()).toEqual({ action: 'mark-read', ids: ['a', 'b'] })
  })

  // Інтерфейс не має показувати те, чого на сервері не сталось.
  it('сервер не прийняв — лічильник вертається як був', async () => {
    respondFail(500)

    const ok = await notifications.markRead(['a', 'b'])

    expect(ok).toBe(false)
    expect(notifications.unreadCount).toBe(5)
  })

  it('немає мережі — теж відкат, без винятку назовні', async () => {
    respondOffline()

    const ok = await notifications.markRead(['a'])

    expect(ok).toBe(false)
    expect(notifications.unreadCount).toBe(5)
  })

  it('порожній список не турбує сервер', async () => {
    const ok = await notifications.markRead([])

    expect(ok).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('нижче нуля лічильник не йде', async () => {
    notifications.setUnreadCount(1)

    await notifications.markRead(['a', 'b', 'c'])

    expect(notifications.unreadCount).toBe(0)
  })

  it('прочитати все — нуль одразу', async () => {
    const promise = notifications.markAllRead()

    expect(notifications.unreadCount).toBe(0)
    await promise
    expect(lastPostBody()).toEqual({ action: 'mark-all-read' })
  })

  it('прочитати все не вдалось — число повертається', async () => {
    respondFail(500)

    const ok = await notifications.markAllRead()

    expect(ok).toBe(false)
    expect(notifications.unreadCount).toBe(5)
  })
})

describe('видалення', () => {
  beforeEach(() => {
    notifications.setUnreadCount(5)
  })

  // Скільки з видалених були непрочитані — знає лише той, хто тримає
  // список, тож рахунок приходить ззовні.
  it('віднімаються тільки непрочитані з видалених', async () => {
    await notifications.remove(['a', 'b', 'c'], 2)

    expect(notifications.unreadCount).toBe(3)
    expect(lastPostBody()).toEqual({ action: 'delete', ids: ['a', 'b', 'c'] })
  })

  it('видалення лише прочитаних лічильник не чіпає', async () => {
    await notifications.remove(['a'], 0)

    expect(notifications.unreadCount).toBe(5)
  })

  it('сервер відмовив — відкат', async () => {
    respondFail(500)

    const ok = await notifications.remove(['a'], 1)

    expect(ok).toBe(false)
    expect(notifications.unreadCount).toBe(5)
  })

  it('порожній список — без запиту', async () => {
    const ok = await notifications.remove([], 0)

    expect(ok).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
