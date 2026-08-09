import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import { setPage, resetPage } from '../mocks/app-state.svelte'
import { getPusher, resetPusher, installFetch } from './helpers/client-infra'

vi.mock('$lib/pusher-client', () => ({
  getPusher,
  disconnectPusher: vi.fn(),
}))
vi.mock('$lib/notifications/sound.svelte', () => ({
  notificationSound: { play: vi.fn(), enabled: true },
}))
vi.mock('$lib/notifications/toast', () => ({ showNotificationToast: vi.fn() }))
vi.mock('$lib/sound/notification', () => ({ playMessageSound: vi.fn() }))

const SidebarHost = (await import('./fixtures/sidebar-host.svelte')).default
const { notifications } = await import('$lib/notifications/store.svelte')
const { chatStore } = await import('$lib/stores/chat-store.svelte')

// Бічна панель дашборда після переїзду на shadcn-svelte (ui/sidebar).
// Розмітку тепер малює бібліотека, а наша тут лише ЛОГІКА — саме її й
// перевіряємо, бо саме вона ламалась:
//
//   • склад пунктів залежить від ролі, і роль береться з page.data, а не
//     з сесії: сесія кешується в cookie на 5 хв, і свіжий майстер бачив
//     би пункти клієнта;
//   • підпис одного й того ж пункту різний для ролей;
//   • активний рядок рахується один, інакше /dashboard/jobs/new
//     підсвічував одразу два пункти;
//   • бейджі беруться зі сторів, а не з page.data — інакше число не
//     оновлювалось би від подій Pusher без перезавантаження.

installFetch()

/** Пункти меню — це посилання всередині панелі. */
function links(): HTMLAnchorElement[] {
  return [
    ...document.querySelectorAll<HTMLAnchorElement>('a[href^="/dashboard"]'),
  ]
}

function linkByText(text: string): HTMLAnchorElement | undefined {
  return links().find((a) => a.textContent?.includes(text))
}

function labels(): string[] {
  return links().map((a) => a.textContent?.trim() ?? '')
}

function renderSidebar(
  over: { role?: string; pathname?: string; chats?: unknown } = {},
) {
  setPage(over.pathname ?? '/dashboard/orders', {
    data: {
      session: { user: { id: 'u-1', name: 'Олена', email: 'o@zunor.org' } },
      role: over.role ?? 'CLIENT',
      chats: over.chats,
    },
  })
  return render(SidebarHost)
}

beforeEach(() => {
  resetPage()
  resetPusher()
  // Стори — модульні синглтони, спільні на весь файл: без скидання
  // число з попереднього тесту їде в наступний.
  //
  // Скидати треба ще й прапорець initialized — через нього панель
  // вирішує, чи тягнути список. Одного unsubscribeAll() для цього мало:
  // він виходить одразу, якщо підписки не було (boundUserId порожній), а
  // вона тут ставиться асинхронно й до наступного тесту може не встигти.
  // Тому гасимо прапорець явно, інакше onMount мовчки виходить і
  // перевірка запиту нічого не перевіряє.
  notifications.disconnect()
  chatStore.unsubscribeAll()
  chatStore.setChats([])
  chatStore.initialized = false
})

describe('склад меню залежить від ролі', () => {
  it('клієнт бачить «Нове замовлення» і не бачить аналітики', () => {
    renderSidebar({ role: 'CLIENT' })

    expect(labels().join(' ')).toContain('Нове замовлення')
    expect(labels().join(' ')).not.toContain('Аналітика')
  })

  it('майстер бачить аналітику і не бачить створення заявки', () => {
    renderSidebar({ role: 'MASTER' })

    expect(labels().join(' ')).toContain('Аналітика')
    expect(labels().join(' ')).not.toContain('Нове замовлення')
  })

  // Роль приходить із layout-load (читана з БД). Якби брали
  // session.user.role, свіжий майстер 5 хвилин бачив би меню клієнта.
  it('невідома роль трактується як клієнт, а не як порожнє меню', () => {
    renderSidebar({ role: undefined })

    expect(labels().join(' ')).toContain('Нове замовлення')
  })

  it('один і той самий пункт підписаний по-різному для ролей', () => {
    const { unmount } = renderSidebar({ role: 'CLIENT' })
    expect(labels().join(' ')).toContain('Мої заявки')
    unmount()

    renderSidebar({ role: 'MASTER' })
    expect(labels().join(' ')).toContain('Заявки поруч')
  })
})

// Активним має бути РІВНО один пункт. Раніше /dashboard/jobs/new
// підсвічував і «Нове замовлення», і «Мої заявки» — бо обидва підходили
// під префікс.
describe('активний пункт', () => {
  function activeHrefs(): string[] {
    return links()
      .filter((a) => a.getAttribute('aria-current') === 'page')
      .map((a) => a.getAttribute('href') ?? '')
  }

  it('точний збіг виграє в префіксного', () => {
    renderSidebar({ pathname: '/dashboard/jobs/new' })

    expect(activeHrefs()).toEqual(['/dashboard/jobs/new'])
  })

  it('вкладена сторінка підсвічує свій розділ', () => {
    renderSidebar({ pathname: '/dashboard/jobs/abc-123' })

    expect(activeHrefs()).toEqual(['/dashboard/jobs'])
  })

  it('серед префіксних збігів виграє найдовший', () => {
    renderSidebar({ pathname: '/dashboard/messages/chat-1' })

    expect(activeHrefs()).toEqual(['/dashboard/messages'])
  })

  it('налаштування активні на будь-якій вкладеній сторінці', () => {
    renderSidebar({ pathname: '/dashboard/settings/account' })

    expect(activeHrefs()).toContain('/dashboard/settings')
  })

  it('на сторінці без свого пункту не підсвічується нічого зайвого', () => {
    renderSidebar({ pathname: '/dashboard' })

    expect(activeHrefs()).toEqual([])
  })
})

// Числа беруться зі сторів. Перевіряємо саме це: page.data тут ні до чого,
// інакше бейдж не оновлювався б від подій Pusher.
describe('бейджі', () => {
  it('без непрочитаних бейджів немає', () => {
    renderSidebar()

    expect(document.querySelector('[data-sidebar="menu-badge"]')).toBeNull()
  })

  it('число повідомлень приходить зі стора чатів', () => {
    chatStore.setChats([
      { id: 'c-1', unreadCount: 2 },
      { id: 'c-2', unreadCount: 1 },
    ] as never)

    renderSidebar()

    expect(linkByText('Повідомлення')?.getAttribute('aria-label')).toBe(
      'Повідомлення — 3',
    )
  })

  it('число сповіщень приходить зі стора сповіщень', () => {
    notifications.setUnreadCount(4)

    renderSidebar()

    expect(linkByText('Сповіщення')?.getAttribute('aria-label')).toBe(
      'Сповіщення — 4',
    )
  })

  // У бейдж влазить один символ, тому все, що більше дев'яти, — «9+».
  // aria-label при цьому лишається з ТОЧНИМ числом: скрінрідеру «9+»
  // нічого не каже.
  it('великі числа скорочуються до 9+, але не в aria-label', () => {
    notifications.setUnreadCount(42)

    renderSidebar()

    const badges = [
      ...document.querySelectorAll('[data-sidebar="menu-badge"]'),
    ].map((n) => n.textContent?.trim())

    expect(badges).toContain('9+')
    expect(linkByText('Сповіщення')?.getAttribute('aria-label')).toBe(
      'Сповіщення — 42',
    )
  })
})

// Sidebar.Rail із блоку sidebar-07 — невидима смуга 16px ПОВЕРХ контенту
// праворуч від панелі (-right-4, z-20), яка перемикає панель по кліку.
// Вона перехоплювала кліки по лівому краю сторінки й підміняла курсор на
// resize, тобто панель «сама згорталась» від кліку повз контент.
// Перемикач у нас свій, на логотипі, тож рейки бути не повинно.
describe('рейка перемикання', () => {
  it('не рендериться — вона перехоплювала кліки по контенту', () => {
    renderSidebar()

    expect(document.querySelector('[data-sidebar="rail"]')).toBeNull()
  })
})

describe('підвал панелі', () => {
  it('рядок користувача веде в профіль, а не відкриває меню', () => {
    renderSidebar()

    const profile = links().find(
      (a) => a.getAttribute('href') === '/dashboard/profile',
    )
    expect(profile).toBeTruthy()
    expect(profile?.textContent).toContain('Олена')
  })

  it('без імені в сесії підставляється запасне, а не порожній рядок', () => {
    setPage('/dashboard', {
      data: { session: { user: { id: 'u-1' } }, role: 'CLIENT' },
    })
    render(SidebarHost)

    const profile = links().find(
      (a) => a.getAttribute('href') === '/dashboard/profile',
    )
    expect(profile?.textContent).toContain('Користувач')
  })
})

// Панель — єдине місце, де чати підтягуються на весь дашборд. Логіка
// проста, але саме вона економить запит до БД на кожній навігації.
describe('ініціалізація чатів', () => {
  it('SSR-список беруть як є, без запиту', () => {
    const refresh = vi.spyOn(chatStore, 'refreshChats')

    renderSidebar({ chats: [{ id: 'c-1', unreadCount: 0 }] })

    expect(refresh).not.toHaveBeenCalled()
    expect(chatStore.initialized).toBe(true)
    refresh.mockRestore()
  })

  it('без SSR-списку йде один запит', () => {
    const refresh = vi
      .spyOn(chatStore, 'refreshChats')
      .mockResolvedValue(undefined as never)

    renderSidebar({ chats: undefined })

    expect(refresh).toHaveBeenCalledTimes(1)
    refresh.mockRestore()
  })

  it('без сесії не робить нічого', () => {
    const refresh = vi
      .spyOn(chatStore, 'refreshChats')
      .mockResolvedValue(undefined as never)

    setPage('/dashboard', { data: { session: null, role: 'CLIENT' } })
    render(SidebarHost)

    expect(refresh).not.toHaveBeenCalled()
    refresh.mockRestore()
  })
})
