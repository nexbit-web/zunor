import { describe, it, expect, afterEach, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import OrderCard from '$lib/components/orders/order-card.svelte'
import type { OrderStatus } from '../../generated/prisma/client'

// Картка замовлення в списку. Головне в ній — ТОЧКА ЗОРУ: один і той самий
// об'єкт показується і клієнту, і майстру, і кожен має бачити другу
// сторону, а не себе. Помилка тут не падає й не логується — людина просто
// бачить у списку власне ім'я й не розуміє, чиє це замовлення.
//
// Друге: телефон другої сторони в картку не потрапляє. У списку замовлення
// ще не відкрите, тож правило «контакти після угоди, і тільки учаснику»
// діє й тут.

const CLIENT = 'client-1'
const MASTER = 'master-1'

type Order = Parameters<typeof OrderCard>[1] extends never ? never : never

function order(over: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    title: 'Прибирання двокімнатної',
    priceCents: 150_000,
    currency: 'UAH',
    status: 'CREATED' as OrderStatus,
    createdAt: '2026-03-15T10:00:00.000Z',
    updatedAt: '2026-03-15T11:00:00.000Z',
    startedAt: null,
    completedAt: null,
    clientId: CLIENT,
    masterId: MASTER,
    client: {
      id: CLIENT,
      name: 'Ігор',
      username: null,
      avatar: null,
    },
    master: {
      id: MASTER,
      name: 'Оля',
      username: 'olya',
      avatar: null,
    },
    ...over,
  }
}

const card = (viewerId: string, over: Record<string, unknown> = {}) =>
  render(OrderCard, {
    props: { order: order(over), viewerId } as never,
  })

afterEach(() => {
  vi.useRealTimers()
})

describe('точка зору', () => {
  it('клієнт бачить майстра', () => {
    const { container } = card(CLIENT)

    expect(container.textContent).toContain('Майстер')
    expect(container.textContent).toContain('Оля')
    expect(container.textContent).not.toContain('Ігор')
  })

  it('майстер бачить замовника', () => {
    const { container } = card(MASTER)

    expect(container.textContent).toContain('Замовник')
    expect(container.textContent).toContain('Ігор')
    expect(container.textContent).not.toContain('Оля')
  })

  it('без імені показується заглушка, а не порожньо', () => {
    const { container } = card(CLIENT, {
      master: { id: MASTER, name: null, username: null, avatar: null },
    })

    expect(container.textContent).toContain('Без імені')
  })

  it('ініціал у аватарі — з імені другої сторони', () => {
    const { container } = card(CLIENT)

    expect(container.textContent).toContain('О')
  })

  it('без імені ініціал не ламається', () => {
    const { container } = card(CLIENT, {
      master: { id: MASTER, name: null, username: null, avatar: null },
    })

    expect(container.textContent).toContain('?')
  })

  // Телефон з'являється лише на сторінці замовлення, і тільки учаснику.
  it('телефон у картку не потрапляє, навіть якщо приїхав у пропсах', () => {
    const { container } = card(CLIENT, {
      master: {
        id: MASTER,
        name: 'Оля',
        username: 'olya',
        avatar: null,
        phone: '+380991234567',
      },
    })

    expect(container.textContent).not.toContain('380991234567')
  })
})

describe('статус', () => {
  const STATUSES: [OrderStatus, string][] = [
    ['CREATED', 'Створено'],
    ['IN_PROGRESS', 'В роботі'],
    ['COMPLETED', 'Завершено'],
    ['CANCELLED', 'Скасовано'],
  ]

  it('кожен статус має свій підпис', () => {
    for (const [status, label] of STATUSES) {
      const { container } = card(CLIENT, { status })
      expect(container.textContent, status).toContain(label)
    }
  })

  // Статус має читатись кольором за пів секунди — тому в кожного свій.
  it('кольори статусів різні, а не один на всіх', () => {
    const chips = STATUSES.map(([status]) => {
      const { container } = card(CLIENT, { status })
      return container.querySelector('span.inline-flex')!.className
    })

    expect(new Set(chips).size).toBe(STATUSES.length)
  })

  // Скасоване замовлення має виглядати як закреслене, інакше в списку воно
  // читається як живе.
  it('скасоване приглушується й ціна закреслюється', () => {
    const { container } = card(CLIENT, { status: 'CANCELLED' })

    expect(container.querySelector('a')!.className).toContain('opacity-70')
    expect(container.innerHTML).toContain('line-through')
  })

  it('активне замовлення не приглушене', () => {
    const { container } = card(CLIENT, { status: 'IN_PROGRESS' })

    expect(container.querySelector('a')!.className).not.toContain('opacity-70')
    expect(container.innerHTML).not.toContain('line-through')
  })
})

describe('ціна й час', () => {
  it('копійки показуються гривнями', () => {
    const { container } = card(CLIENT, { priceCents: 150_000 })

    expect(container.textContent).toMatch(/1\s?500/)
    expect(container.textContent).toContain('₴')
  })

  it('нульова ціна не зникає', () => {
    const { container } = card(CLIENT, { priceCents: 0 })

    expect(container.textContent).toMatch(/0/)
  })

  // Дата відповідає на питання «коли це востаннє рухалось» — тому
  // updatedAt, а не createdAt.
  it('показується час останнього руху, а не створення', () => {
    const { container } = card(CLIENT, {
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2026-03-15T11:00:00.000Z',
    })

    expect(container.querySelector('time')!.getAttribute('datetime')).toBe(
      '2026-03-15T11:00:00.000Z',
    )
  })

  it('відносний час читається по-людськи', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))

    const cases: [string, string][] = [
      ['2026-03-15T11:59:40.000Z', 'щойно'],
      ['2026-03-15T11:30:00.000Z', '30 хв тому'],
      ['2026-03-15T09:00:00.000Z', '3 год тому'],
      ['2026-03-14T12:00:00.000Z', 'учора'],
      ['2026-03-12T12:00:00.000Z', '3 дн тому'],
    ]

    for (const [iso, expected] of cases) {
      const { container } = card(CLIENT, { updatedAt: iso })
      expect(container.querySelector('time')!.textContent?.trim(), iso).toBe(
        expected,
      )
    }
  })
})

describe('посилання', () => {
  it('картка веде на сторінку замовлення', () => {
    const { container } = card(CLIENT, { id: 'order-42' })

    expect(container.querySelector('a')!.getAttribute('href')).toBe(
      '/dashboard/orders/order-42',
    )
  })

  it('назва замовлення показується', () => {
    const { container } = card(CLIENT, { title: 'Мийка вікон, 5 штук' })

    expect(container.textContent).toContain('Мийка вікон, 5 штук')
  })

  // Назву пише клієнт (через асистента) — розмітка в ній лишається текстом.
  it('розмітка в назві не виконується', () => {
    const { container } = card(CLIENT, {
      title: '<img src=x onerror=alert(1)>',
    })

    const heading = container.querySelector('h3')!
    expect(heading.querySelector('img')).toBeNull()
    expect(heading.textContent).toContain('<img')
    expect(heading.innerHTML).toContain('&lt;img')
  })
})
