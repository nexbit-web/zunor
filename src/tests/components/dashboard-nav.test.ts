import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import { setPage, resetPage } from '../mocks/app-state.svelte'
import { getPusher, resetPusher, installFetch } from './helpers/client-infra'

vi.mock('$lib/pusher-client', () => ({ getPusher }))
vi.mock('$lib/notifications/sound.svelte', () => ({
  notificationSound: { play: vi.fn(), enabled: true },
}))
vi.mock('$lib/notifications/toast', () => ({ showNotificationToast: vi.fn() }))
vi.mock('$lib/sound/notification', () => ({ playMessageSound: vi.fn() }))

const BottomNav = (await import('$lib/components/dashboard/bottom-nav.svelte'))
  .default
const { notifications } = await import('$lib/notifications/store.svelte')
const { chatStore } = await import('$lib/stores/chat-store.svelte')

// Нижнє меню на мобільному. Цікаве в ньому саме те, що ламалось:
//
//   • бейджі беруться зі сторів, а не з page.data — раніше це були
//     3-5 запитів до БД на КОЖНУ навігацію дашборда;
//   • бейдж — $derived, тож змінити число в сторі досить, щоб він
//     перемалювався: у цьому й був сенс переїзду в стори;
//   • «Профіль» підсвічується лише на точному збігу — інакше він горів би
//     на всіх сторінках дашборда одразу.

function chat(id: string, unread: number) {
  return {
    id,
    peer: {
      id: 'p',
      name: 'Оля',
      username: null,
      avatar: null,
      isVerified: false,
    },
    lastMessageText: null,
    lastMessageAt: null,
    lastSenderId: null,
    unreadCount: unread,
    updatedAt: '2026-03-15T12:00:00.000Z',
  }
}

/** Посилання пункту меню за href. */
function link(container: HTMLElement, href: string): HTMLAnchorElement {
  const el = container.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)
  if (!el) throw new Error(`немає пункту меню ${href}`)
  return el
}

beforeEach(() => {
  resetPusher()
  installFetch()
  resetPage()
  notifications.disconnect()
  chatStore.setChats([])
})

describe('склад меню', () => {
  it('показує п’ять ключових розділів', () => {
    const { container } = render(BottomNav)

    for (const href of [
      '/dashboard',
      '/dashboard/jobs',
      '/dashboard/orders',
      '/dashboard/messages',
      '/dashboard/notifications',
    ]) {
      expect(link(container, href)).toBeTruthy()
    }
  })

  // Аналітика свідомо не винесена вниз: на вузькому екрані немає місця.
  it('аналітики в нижньому меню немає', () => {
    const { container } = render(BottomNav)

    expect(container.querySelector('a[href="/dashboard/analytics"]')).toBeNull()
  })

  it('усі пункти — справжні посилання, а не кнопки з goto', () => {
    const { container } = render(BottomNav)

    expect(container.querySelectorAll('a')).toHaveLength(5)
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})

describe('підсвітка активного', () => {
  it('на /dashboard горить лише «Профіль»', () => {
    setPage('/dashboard')
    const { container } = render(BottomNav)

    expect(link(container, '/dashboard').getAttribute('style')).toContain(
      'opacity: 1',
    )
    expect(link(container, '/dashboard/jobs').getAttribute('style')).toContain(
      'opacity: 0.55',
    )
  })

  // exact: true саме тут — інакше «Профіль» світився б на всіх сторінках
  // дашборда одночасно з розділом.
  it('на вкладеній сторінці «Профіль» гасне', () => {
    setPage('/dashboard/orders')
    const { container } = render(BottomNav)

    expect(link(container, '/dashboard').getAttribute('style')).toContain(
      'opacity: 0.55',
    )
    expect(
      link(container, '/dashboard/orders').getAttribute('style'),
    ).toContain('opacity: 1')
  })

  it('розділ горить і на своїй вкладеній сторінці', () => {
    setPage('/dashboard/messages/chat-42')
    const { container } = render(BottomNav)

    expect(
      link(container, '/dashboard/messages').getAttribute('style'),
    ).toContain('opacity: 1')
  })

  it('поза дашбордом не горить нічого', () => {
    setPage('/')
    const { container } = render(BottomNav)

    for (const a of container.querySelectorAll('a')) {
      expect(a.getAttribute('style')).toContain('opacity: 0.55')
    }
  })
})

describe('бейджі', () => {
  it('без непрочитаних бейджів немає зовсім', () => {
    const { container } = render(BottomNav)

    expect(link(container, '/dashboard/messages').textContent).not.toMatch(/\d/)
  })

  it('непрочитані чати показуються на «Чат»', () => {
    chatStore.setChats([chat('a', 2), chat('b', 3)])
    const { container } = render(BottomNav)

    expect(link(container, '/dashboard/messages').textContent).toContain('5')
  })

  it('непрочитані сповіщення — на «Сповіщення»', () => {
    notifications.setUnreadCount(4)
    const { container } = render(BottomNav)

    expect(link(container, '/dashboard/notifications').textContent).toContain(
      '4',
    )
  })

  // Два лічильники — з різних сторів; переплутати їх місцями легко, а
  // помітити важко.
  it('лічильники не плутаються місцями', () => {
    chatStore.setChats([chat('a', 7)])
    notifications.setUnreadCount(2)
    const { container } = render(BottomNav)

    expect(link(container, '/dashboard/messages').textContent).toContain('7')
    expect(link(container, '/dashboard/notifications').textContent).toContain(
      '2',
    )
  })

  // Бейдж — $derived від стору. Якби він був звичайним const, число
  // застигло б на значенні при монтуванні.
  it('бейдж оновлюється, коли змінюється стор', async () => {
    const { container } = render(BottomNav)
    expect(link(container, '/dashboard/notifications').textContent).not.toMatch(
      /\d/,
    )

    notifications.setUnreadCount(3)

    await vi.waitFor(() =>
      expect(link(container, '/dashboard/notifications').textContent).toContain(
        '3',
      ),
    )
  })

  it('великі числа обрізаються до 99+', () => {
    notifications.setUnreadCount(1234)
    const { container } = render(BottomNav)

    expect(link(container, '/dashboard/notifications').textContent).toContain(
      '99+',
    )
  })

  it('рівно 99 показується як є', () => {
    notifications.setUnreadCount(99)
    const { container } = render(BottomNav)

    const text = link(container, '/dashboard/notifications').textContent
    expect(text).toContain('99')
    expect(text).not.toContain('99+')
  })

  it('на «Заявках» і «Замовленнях» бейджів не буває', () => {
    chatStore.setChats([chat('a', 5)])
    notifications.setUnreadCount(5)
    const { container } = render(BottomNav)

    expect(link(container, '/dashboard/jobs').textContent).not.toMatch(/\d/)
    expect(link(container, '/dashboard/orders').textContent).not.toMatch(/\d/)
  })
})
