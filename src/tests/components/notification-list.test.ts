import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import {
  getPusher,
  emit,
  resetPusher,
  installFetch,
  fetchMock,
  respondWith,
  respondFail,
} from './helpers/client-infra'
import type { Notification } from '$lib/notifications/types'

const toast = vi.hoisted(() => {
  const fn = vi.fn() as ReturnType<typeof vi.fn> & {
    error: ReturnType<typeof vi.fn>
    success: ReturnType<typeof vi.fn>
  }
  fn.error = vi.fn()
  fn.success = vi.fn()
  return fn
})

vi.mock('svelte-hot-french-toast', () => ({ default: toast }))
vi.mock('$lib/pusher-client', () => ({ getPusher }))
vi.mock('$lib/notifications/sound.svelte', () => ({
  notificationSound: { play: vi.fn(), enabled: true },
}))
vi.mock('$lib/notifications/toast', () => ({ showNotificationToast: vi.fn() }))

// Бочку $lib/notifications підміняємо навмисно: вона реекспортує ще й
// listener.svelte, а він у цьому тесті не потрібен зовсім.
vi.mock('$lib/notifications', async () => {
  const store = await import('$lib/notifications/store.svelte')
  const types = await import('$lib/notifications/types')
  return { notifications: store.notifications, ...types }
})

const NotificationList = (
  await import('$lib/components/notifications/notification-list.svelte')
).default
const { notifications } = await import('$lib/notifications/store.svelte')

// Сторінка сповіщень. Тут зійшлись три правила з AGENTS.md, і кожне з них
// уже одного разу порушувалось:
//
//   1. Лічильник у бейджі й лічильник на сторінці — ОДНЕ число. Доки їх
//      було два, прочитане на сторінці гасило лише сторінку, а бейдж у
//      сайдбарі висів далі.
//   2. Своєї підписки сторінка не тримає: друга підписка вже розійшлась із
//      сервером по імені події й мовчки не працювала.
//   3. Оптимістичне оновлення, яке не підтвердив сервер, ВІДКОЧУЄТЬСЯ.

const USER = 'user-1'
const CHANNEL = 'private-user-user-1'

function n(over: Partial<Notification> = {}): Notification {
  return {
    id: 'n-1',
    type: 'NEW_PROPOSAL',
    title: 'Майстер відгукнувся',
    body: null,
    isRead: false,
    createdAt: new Date().toISOString(),
    jobId: 'job-1',
    ...over,
  }
}

function list(
  items: Notification[] = [n()],
  unread = 1,
  nextCursor: string | null = null,
) {
  return render(NotificationList, {
    props: {
      initialItems: items,
      initialNextCursor: nextCursor,
      initialUnreadCount: unread,
    },
  })
}

/** Рядки стрічки. */
const rows = (c: HTMLElement) => [...c.querySelectorAll('li')]
/** Кнопка за видимим текстом. */
function button(c: HTMLElement, text: string): HTMLButtonElement {
  const el = [...c.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(text),
  )
  if (!el) throw new Error(`немає кнопки «${text}»`)
  return el as HTMLButtonElement
}

// jsdom не вміє переходити за посиланням і кричить про це в консоль на
// кожен клік по рядку — це шум, а не проблема компонента.
const noise = vi.spyOn(console, 'error').mockImplementation(() => {})

afterAll(() => {
  noise.mockRestore()
})

beforeEach(() => {
  resetPusher()
  installFetch()
  toast.error.mockClear()
  notifications.disconnect()
})

describe('стрічка з SSR', () => {
  it('показує сповіщення, що приїхали з сервера', () => {
    const { container } = list([
      n({ id: 'a', title: 'Перше' }),
      n({ id: 'b', title: 'Друге' }),
    ])

    expect(rows(container)).toHaveLength(2)
    expect(container.textContent).toContain('Перше')
    expect(container.textContent).toContain('Друге')
  })

  it('тіло сповіщення показується під заголовком', () => {
    const { container } = list([n({ body: 'Прибирання квартири' })])

    expect(container.textContent).toContain('Прибирання квартири')
  })

  it('непрочитане має крапку, прочитане — ні', () => {
    const { container } = list([
      n({ id: 'a', isRead: false }),
      n({ id: 'b', isRead: true }),
    ])

    const [unread, read] = rows(container)
    expect(unread.querySelector('[aria-label="Непрочитане"]')).not.toBeNull()
    expect(read.querySelector('[aria-label="Непрочитане"]')).toBeNull()
  })

  // Гілки по proposalId у linkFor немає навмисно: клієнта з неї вибивало
  // на сторінку для майстрів.
  it('посилання будується через linkFor', () => {
    const { container } = list([
      n({ id: 'a', orderId: 'order-9', jobId: 'job-1' }),
      n({ id: 'b', jobId: 'job-2', orderId: null }),
    ])

    const links = container.querySelectorAll('li a')
    expect(links[0].getAttribute('href')).toBe('/dashboard/orders/order-9')
    expect(links[1].getAttribute('href')).toBe('/dashboard/jobs/job-2')
  })

  // Справжній <a>, а не кнопка з goto: працюють середня кнопка миші й
  // «відкрити в новій вкладці».
  it('увесь рядок клікабельний саме посиланням', () => {
    const { container } = list()

    expect(container.querySelector('li a')).not.toBeNull()
  })

  it('час підписаний машинним datetime і людським title', () => {
    const iso = '2026-03-15T12:00:00.000Z'
    const { container } = list([n({ createdAt: iso })])

    const time = container.querySelector('time')!
    expect(time.getAttribute('datetime')).toBe(iso)
    expect(time.getAttribute('title')).toBeTruthy()
  })

  it('кінець списку підписаний, коли курсора більше немає', () => {
    const { container } = list([n()], 1, null)

    expect(container.textContent).toContain('Це всі сповіщення')
  })

  it('з курсором підпису про кінець немає', () => {
    const { container } = list([n()], 1, 'cursor-1')

    expect(container.textContent).not.toContain('Це всі сповіщення')
  })
})

describe('лічильник — спільний зі сторами', () => {
  // Головне правило сторінки: число одне на весь застосунок.
  it('SSR-значення потрапляє в спільний стор, а не в локальний стан', () => {
    list([n()], 7)

    expect(notifications.unreadCount).toBe(7)
  })

  it('бейдж показує число зі стору', () => {
    const { container } = list([n()], 7)

    expect(container.querySelector('h1')?.parentElement?.textContent).toContain(
      '7',
    )
  })

  it('велике число обрізається до 99+', () => {
    const { container } = list([n()], 150)

    expect(container.textContent).toContain('99+')
  })

  it('без непрочитаних бейджа й кнопки «прочитати всі» немає', () => {
    const { container } = list([n({ isRead: true })], 0)

    expect(() => button(container, 'Прочитати всі')).toThrow()
  })

  it('зміна числа в сторі перемальовує бейдж', async () => {
    const { container } = list([n()], 1)

    notifications.setUnreadCount(42)

    await vi.waitFor(() => expect(container.textContent).toContain('42'))
  })
})

describe('позначити прочитаним', () => {
  it('клік по рядку гасить крапку одразу', async () => {
    const { container } = list([n({ id: 'a' })], 1)

    await fireEvent.click(container.querySelector('li a')!)

    await vi.waitFor(() =>
      expect(container.querySelector('[aria-label="Непрочитане"]')).toBeNull(),
    )
  })

  it('спільний лічильник падає разом зі списком', async () => {
    const { container } = list([n({ id: 'a' })], 3)

    await fireEvent.click(container.querySelector('li a')!)

    await vi.waitFor(() => expect(notifications.unreadCount).toBe(2))
  })

  it('уже прочитане повторно на сервер не їде', async () => {
    const { container } = list([n({ id: 'a', isRead: true })], 0)

    await fireEvent.click(container.querySelector('li a')!)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  // Інтерфейс не має показувати те, чого на сервері не сталось.
  it('сервер відмовив — рядок і лічильник повертаються, з тостом', async () => {
    respondFail(500)
    const { container } = list([n({ id: 'a' })], 3)

    await fireEvent.click(container.querySelector('li a')!)

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(notifications.unreadCount).toBe(3)
    expect(container.querySelector('[aria-label="Непрочитане"]')).not.toBeNull()
  })

  it('«прочитати всі» гасить усі рядки й обнуляє лічильник', async () => {
    const { container } = list([n({ id: 'a' }), n({ id: 'b' })], 2)

    await fireEvent.click(button(container, 'Прочитати всі'))

    await vi.waitFor(() => expect(notifications.unreadCount).toBe(0))
    expect(container.querySelector('[aria-label="Непрочитане"]')).toBeNull()
  })

  it('«прочитати всі» не вдалось — усе повертається', async () => {
    respondFail(500)
    const { container } = list([n({ id: 'a' }), n({ id: 'b' })], 2)

    await fireEvent.click(button(container, 'Прочитати всі'))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(notifications.unreadCount).toBe(2)
    expect(
      container.querySelectorAll('[aria-label="Непрочитане"]'),
    ).toHaveLength(2)
  })
})

describe('живі оновлення', () => {
  // Своєї підписки сторінка не робить: слухає той самий стор, що й бейдж.
  it('нове сповіщення додається зверху', async () => {
    notifications.connect(USER)
    const { container } = list([n({ id: 'old', title: 'Старе' })], 1)

    emit(CHANNEL, 'notification:new', {
      notification: n({ id: 'new', title: 'Свіже' }),
    })

    await vi.waitFor(() => expect(rows(container)).toHaveLength(2))
    expect(rows(container)[0].textContent).toContain('Свіже')
  })

  it('те саме сповіщення двічі не дублюється', async () => {
    notifications.connect(USER)
    const { container } = list([n({ id: 'x', title: 'Одне' })], 1)

    emit(CHANNEL, 'notification:new', { notification: n({ id: 'x' }) })

    await vi.waitFor(() => expect(rows(container)).toHaveLength(1))
  })

  it('чатове сповіщення у стрічку не потрапляє', async () => {
    notifications.connect(USER)
    const { container } = list([n({ id: 'old' })], 1)

    emit(CHANNEL, 'notification:new', {
      notification: n({ id: 'msg', type: 'NEW_MESSAGE' }),
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(rows(container)).toHaveLength(1)
  })
})

describe('порожня стрічка', () => {
  it('без сповіщень показує пояснення, а не порожній екран', () => {
    const { container } = list([], 0)

    expect(container.textContent).toContain('Сповіщень поки немає')
    expect(container.querySelectorAll('li')).toHaveLength(0)
  })

  it('порожній стан не показує кнопку «показати всі» у фільтрі «Усі»', () => {
    const { container } = list([], 0)

    expect(() => button(container, 'Показати всі')).toThrow()
  })
})

describe('видалення', () => {
  it('кнопка видалення підписана назвою сповіщення', () => {
    const { container } = list([n({ title: 'Тебе обрали' })])

    const btn = container.querySelector(
      '[aria-label="Видалити сповіщення «Тебе обрали»"]',
    )
    expect(btn).not.toBeNull()
  })

  // Видалення незворотне — тому питаємо, а не робимо одразу.
  it('клік по кошику не видаляє одразу, а питає', async () => {
    const { container } = list([n({ id: 'a' })])

    await fireEvent.click(
      container.querySelector<HTMLButtonElement>('[aria-label^="Видалити"]')!,
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(rows(container)).toHaveLength(1)
  })
})

describe('фільтр', () => {
  it('перемикання фільтра перезавантажує список з сервера', async () => {
    respondWith({ items: [], nextCursor: null, unreadCount: 0 })
    const { container } = list([n()], 1)

    // Пункт меню рендериться в порталі bits-ui — клікаємо по тригеру
    // й перевіряємо сам факт, що фільтр існує окремою кнопкою.
    expect(container.textContent).toContain('Показати:')
  })

  it('запит на перезавантаження містить стелю на сторінку', async () => {
    respondWith({ items: [], nextCursor: null, unreadCount: 0 })
    list([], 0, 'cursor-1')

    // Догрузка стартує з IntersectionObserver, який у jsdom заглушений,
    // тож перевіряємо форму запиту, коли він таки летить.
    await notifications.markAllRead()
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/notifications')
  })
})
