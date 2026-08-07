import { describe, it, expect } from 'vitest'
import {
  ORDER_STATUS,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_COLOR,
  PROPOSAL_STATUS_LABEL,
  JOB_STATUS_LABEL,
  formatPrice,
  formatMoney,
  formatBudget,
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
