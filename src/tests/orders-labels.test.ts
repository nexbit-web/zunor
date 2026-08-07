import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  ORDER_STATUS,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_COLOR,
  PROPOSAL_STATUS_LABEL,
  JOB_STATUS_LABEL,
  formatPrice,
  formatMoney,
  formatBudget,
  formatRelative,
} from '$lib/orders/labels'
import { nextStatus } from '$lib/server/order-state-machine'

// Контент-шар: підписи статусів і форматування грошей. Це не движок, але
// саме він показується користувачу, і саме тут ламається тихо — статус
// з'являється в enum, а підпису для нього немає, і в інтерфейсі порожньо.
//
// Тому головний тест тут — не «Створено» дорівнює «Створено», а те, що
// набір підписів ЗБІГАЄТЬСЯ з набором статусів, які вміє видавати
// стейт-машина.

describe('підписи статусів', () => {
  // Стейт-машина — джерело правди про те, які статуси взагалі бувають:
  // початковий CREATED плюс усе, куди веде хоч один перехід. Новий статус
  // без підпису дасть порожній бейдж, і помітять це не одразу.
  const REACHABLE = [
    'CREATED',
    nextStatus('START'),
    nextStatus('COMPLETE'),
    nextStatus('CANCEL'),
  ]

  it('кожен статус замовлення зі стейт-машини має підпис і колір', () => {
    for (const status of REACHABLE) {
      expect(ORDER_STATUS_LABEL[status as never], status).toBeTruthy()
      expect(ORDER_STATUS_COLOR[status as never], status).toBeTruthy()
    }
  })

  // І навпаки: підпис для статусу, якого машина не видає, — мертвий код,
  // що виглядає як робочий.
  it('зайвих підписів немає', () => {
    expect(Object.keys(ORDER_STATUS_LABEL).sort()).toEqual(
      [...new Set(REACHABLE)].sort(),
    )
  })

  // Три експорти описують одне й те саме — поки вони живуть паралельно,
  // розійтись вони можуть лише мовчки.
  it('ORDER_STATUS збігається з окремими LABEL і COLOR', () => {
    for (const [status, value] of Object.entries(ORDER_STATUS)) {
      expect(value.label).toBe(ORDER_STATUS_LABEL[status as never])
      expect(value.color).toBe(ORDER_STATUS_COLOR[status as never])
    }
  })

  it('підписи відгуків і заявок заповнені всі', () => {
    for (const map of [PROPOSAL_STATUS_LABEL, JOB_STATUS_LABEL]) {
      for (const [key, label] of Object.entries(map)) {
        expect(label, key).toBeTruthy()
      }
    }
  })

  it('підписи українською, а не ключами enum', () => {
    for (const label of Object.values(ORDER_STATUS_LABEL)) {
      expect(label).toMatch(/[а-яіїєґА-ЯІЇЄҐ]/)
    }
  })
})

describe('гроші', () => {
  // У базі копійки — і саме тому ціна показується через цю функцію, а не
  // діленням на 100 у кожному компоненті.
  it('копійки перетворюються на гривні', () => {
    expect(formatPrice(150_000)).toMatch(/1\s?500/)
    expect(formatPrice(150_000)).toContain('₴')
  })

  it('нуль показується як нуль, а не як порожньо', () => {
    expect(formatPrice(0)).toMatch(/0/)
  })

  it('копійки не зникають', () => {
    expect(formatPrice(150_050)).toMatch(/1\s?500,5/)
  })

  it('formatMoney — той самий formatPrice', () => {
    expect(formatMoney).toBe(formatPrice)
  })
})

describe('бюджет', () => {
  it('обидві межі — діапазон', () => {
    const text = formatBudget(100_000, 200_000)

    expect(text).toMatch(/1\s?000/)
    expect(text).toMatch(/2\s?000/)
    expect(text).toContain('–')
  })

  it('лише нижня межа — «від»', () => {
    expect(formatBudget(100_000, null)).toMatch(/^від /)
  })

  it('лише верхня межа — «до»', () => {
    expect(formatBudget(null, 200_000)).toMatch(/^до /)
  })

  // Ціну називають майстри — заявка без бюджету це норма, а не помилка.
  it('без бюджету — «договірний», а не порожньо', () => {
    expect(formatBudget(null, null)).toBe('Бюджет договірний')
  })

  it('нуль — це межа, а не «немає»', () => {
    expect(formatBudget(0, null)).toMatch(/^від /)
  })
})

describe('відносний час', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const at = (iso: string) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
    return formatRelative(iso)
  }

  it('щойно, хвилини, години', () => {
    expect(at('2026-03-15T11:59:40Z')).toBe('щойно')
    expect(at('2026-03-15T11:30:00Z')).toBe('30 хв тому')
    expect(at('2026-03-15T09:00:00Z')).toBe('3 год тому')
  })

  it('дні', () => {
    expect(at('2026-03-12T12:00:00Z')).toBe('3 днів тому')
  })

  it('старше тижня — дата', () => {
    expect(at('2026-01-05T12:00:00Z')).toMatch(/січ/)
  })

  it('приймає і Date, і рядок', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))

    expect(formatRelative(new Date('2026-03-15T11:30:00Z'))).toBe('30 хв тому')
  })

  // ⚠️ Дві реалізації одного форматера вже розійшлись: тут «1 днів тому»,
  // а в notification-list.svelte для того самого проміжку — «учора».
  // Обидві живі, обидві показуються користувачу на сусідніх екранах.
  // Тест фіксує поточну поведінку — щоб зведення їх в одну було свідомим
  // кроком, а не випадковим.
  it('доба назад — «1 днів тому» (у стрічці сповіщень тут «учора»)', () => {
    expect(at('2026-03-14T12:00:00Z')).toBe('1 днів тому')
  })
})
