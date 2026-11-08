import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import { goto, resetNavigation } from '../mocks/app-navigation'
import type { Toast } from 'svelte-hot-french-toast'
import type { Notification } from '$lib/notifications/types'

const toastLib = vi.hoisted(() => {
  const fn = Object.assign(vi.fn(), {
    custom: vi.fn(),
    dismiss: vi.fn(),
  })
  return fn
})
// Що зараз на екрані — тости бібліотеки, від нового до старого.
const onScreen = vi.hoisted(() => ({
  toasts: [] as { id: string; visible: boolean }[],
}))
vi.mock('svelte-hot-french-toast', () => ({
  default: toastLib,
  useToasterState: () => onScreen,
}))

const { default: Island } = await import('$lib/notifications/island.svelte')
const { showNotificationToast } = await import('$lib/notifications/toast')

// Сповіщення-«острів»: тост, з якого можна одразу перейти до заявки чи
// замовлення. Тут тримаються дві обіцянки:
//
//   • кнопка веде саме туди, куди й рядок у стрічці сповіщень (linkFor),
//     і лише перехід позначає сповіщення прочитаним — «Пізніше» ні;
//   • тип сповіщення каже, ЩО станеться: «Залишити відгук», а не «Відкрити».

const toastObj = (over: Partial<Toast> = {}): Toast =>
  ({
    id: 't1',
    type: 'custom',
    visible: true,
    message: undefined,
    pauseDuration: 0,
    createdAt: Date.now(),
    ariaProps: { role: 'status', 'aria-live': 'polite' },
    ...over,
  }) as Toast

const Icon = (() => {}) as never

function island(over: Record<string, unknown> = {}) {
  const onopen = vi.fn()
  const view = render(Island, {
    props: {
      toast: toastObj(),
      label: 'Нова заявка',
      title: 'Є нова заявка для тебе',
      body: 'Генеральне прибирання',
      action: 'Переглянути заявку',
      href: '/dashboard/jobs/j1',
      icon: Icon,
      duration: 10_000,
      onopen,
      ...over,
    } as never,
  })
  return { ...view, onopen }
}

beforeEach(() => {
  resetNavigation()
  toastLib.custom.mockClear()
  toastLib.dismiss.mockClear()
  onScreen.toasts = []
})

describe('острів', () => {
  it('показує заголовок, подробиці й дію', () => {
    const { container } = island()

    expect(container.textContent).toContain('Є нова заявка для тебе')
    expect(container.textContent).toContain('Генеральне прибирання')
    expect(container.textContent).toContain('Переглянути заявку')
  })

  it('дія веде за адресою, позначає прочитаним і закриває острів', async () => {
    const { getByText, onopen } = island()

    await fireEvent.click(getByText('Переглянути заявку'))

    expect(goto).toHaveBeenCalledWith('/dashboard/jobs/j1')
    expect(onopen).toHaveBeenCalledTimes(1)
    expect(toastLib.dismiss).toHaveBeenCalledWith('t1')
  })

  // «Пізніше» — не прочитав: сповіщення лишається в стрічці непрочитаним.
  it('«Пізніше» лише закриває — без переходу й без позначки', async () => {
    const { getByText, onopen } = island()

    await fireEvent.click(getByText('Пізніше'))

    expect(toastLib.dismiss).toHaveBeenCalledWith('t1')
    expect(goto).not.toHaveBeenCalled()
    expect(onopen).not.toHaveBeenCalled()
  })

  it('Escape закриває острів', async () => {
    const { container } = island()

    await fireEvent.keyDown(container.querySelector('.island')!, {
      key: 'Escape',
    })

    expect(toastLib.dismiss).toHaveBeenCalledWith('t1')
  })

  // Текст приходить із бази — розмітка в ньому лишається текстом.
  it('розмітка в тексті сповіщення не виконується', () => {
    const { container } = island({ body: '<img src=x onerror=alert(1)>' })

    expect(container.querySelector('img[src="x"]')).toBeNull()
    expect(container.textContent).toContain('<img')
  })
})

describe('тип сповіщення → острів', () => {
  const n = (over: Partial<Notification>): Notification => ({
    id: 'n1',
    type: 'NEW_JOB',
    title: 'Заголовок',
    isRead: false,
    createdAt: '2026-10-29T00:00:00.000Z',
    ...over,
  })

  const shown = () =>
    toastLib.custom.mock.calls[0][1] as {
      id: string
      props: { action: string; href: string; onopen?: () => void }
    }

  it('нова заявка — веде на заявку', () => {
    showNotificationToast(n({ type: 'NEW_JOB', jobId: 'j1' }))

    expect(shown().props.href).toBe('/dashboard/jobs/j1')
    expect(shown().props.action).toBe('Переглянути заявку')
  })

  it('завершене замовлення — кличе залишити відгук на замовленні', () => {
    showNotificationToast(n({ type: 'ORDER_COMPLETED', orderId: 'o1' }))

    expect(shown().props.href).toBe('/dashboard/orders/o1')
    expect(shown().props.action).toBe('Залишити відгук')
  })

  it('невідомий тип — загальний острів, а не падіння', () => {
    showNotificationToast(n({ type: 'SOMETHING_NEW' }))

    expect(shown().props.action).toBe('Відкрити')
    expect(shown().props.href).toBe('/dashboard/notifications')
  })

  // Та сама подія двічі (перепідключення Pusher) — один острів, не два:
  // повтор, поки картка на екрані, пропускається (див. «повтор тієї самої
  // події» нижче).
  it('id острова — з id сповіщення', () => {
    showNotificationToast(n({ id: 'abc' }))

    expect(shown().id).toBe('notification-abc')
  })

  it('перехід передає стору сигнал «прочитано»', () => {
    const onOpen = vi.fn()
    showNotificationToast(n({}), onOpen)

    shown().props.onopen?.()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  // Пачка сповіщень за раз їхала стовпчиком за нижній край екрана.
  // Тепер на екрані не більше трьох: найстаріша закривається сама (у
  // стрічці сповіщення лишається).
  describe('не більше трьох карток', () => {
    const card = (id: string, visible = true) => ({ id, visible })

    it('четверта закриває найстарішу', () => {
      onScreen.toasts = [
        card('notification-c'),
        card('notification-b'),
        card('notification-a'),
      ]

      showNotificationToast(n({ id: 'd' }))

      expect(toastLib.dismiss).toHaveBeenCalledTimes(1)
      expect(toastLib.dismiss).toHaveBeenCalledWith('notification-a')
      expect(shown().id).toBe('notification-d')
    })

    // Повтор не оновлює картку за тим самим id, а пропускається:
    // бібліотека не забуває спрацьований таймер закриття, і картка,
    // оживлена повтором під час зникання, висіла б назавжди.
    it('повтор тієї самої події нікого не закриває й не показується', () => {
      onScreen.toasts = [
        card('notification-c'),
        card('notification-b'),
        card('notification-a'),
      ]

      showNotificationToast(n({ id: 'b' }))

      expect(toastLib.dismiss).not.toHaveBeenCalled()
      expect(toastLib.custom).not.toHaveBeenCalled()
    })

    it('повтор картки, що вже зникає, теж пропускається', () => {
      onScreen.toasts = [card('notification-b', false)]

      showNotificationToast(n({ id: 'b' }))

      expect(toastLib.custom).not.toHaveBeenCalled()
    })

    // Рахуються лише видимі картки сповіщень: та, що вже йде, і плашка
    // «Скопійовано» місця не займають.
    it('ті, що вже зникають, і чужі тости не рахуються', () => {
      onScreen.toasts = [
        card('copied'),
        card('notification-c'),
        card('notification-b', false),
        card('notification-a'),
      ]

      showNotificationToast(n({ id: 'd' }))

      expect(toastLib.dismiss).not.toHaveBeenCalled()
    })
  })
})
