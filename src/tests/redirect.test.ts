import { describe, it, expect } from 'vitest'
import { safeRedirectTarget } from '$lib/utils/redirect'

// Значення приходить із ?redirectTo=, тобто з посилання, яке зловмисник
// надсилає жертві. Після успішного входу воно йде і в goto(), і в
// callbackURL для better-auth — браузер піде туди вже з ЖИВОЮ сесією.
// Тому кожен кейс тут читається як «чи можна відправити залогіненого
// користувача на чужий домен».

const FALLBACK = '/dashboard'

/**
 * Куди браузер справді піде, отримавши цей шлях. Саме так його читають і
 * goto(), і better-auth: через WHATWG URL відносно нашого origin. Потрібно,
 * щоб тести перевіряли реальний наслідок, а не форму рядка.
 */
function targetOrigin(path: string): string {
  return new URL(path, 'https://zunor.com').origin
}

describe('внутрішні шляхи проходять', () => {
  it('порожній вхід → дашборд', () => {
    expect(safeRedirectTarget(null)).toBe(FALLBACK)
    expect(safeRedirectTarget('')).toBe(FALLBACK)
  })

  it('звичайний шлях повертається як є', () => {
    expect(safeRedirectTarget('/dashboard/orders')).toBe('/dashboard/orders')
    expect(safeRedirectTarget('/dashboard/jobs?tab=open')).toBe(
      '/dashboard/jobs?tab=open',
    )
  })

  it('сторінки входу відкидаються — інакше петля login → login', () => {
    expect(safeRedirectTarget('/user/login')).toBe(FALLBACK)
    expect(safeRedirectTarget('/user/register')).toBe(FALLBACK)
  })
})

describe('чужий домен не проходить', () => {
  const external = [
    'https://evil.com/steal',
    'http://evil.com',
    '//evil.com', // protocol-relative
    '/\\evil.com', // браузер трактує як //evil.com
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://zunor.com.evil.com', // домен-двійник
  ]

  for (const raw of external) {
    it(`${raw} → дашборд`, () => {
      expect(safeRedirectTarget(raw)).toBe(FALLBACK)
    })
  }

  it('усе, що пройшло фільтр, лишається на нашому origin', () => {
    for (const raw of external) {
      expect(targetOrigin(safeRedirectTarget(raw))).toBe('https://zunor.com')
    }
  })
})

// Браузер (і WHATWG URL, за яким працюють goto та better-auth) ВИКИДАЄ
// табуляцію, перевід рядка й повернення каретки з URL ще ДО розбору.
// Тому "/<TAB>/evil.com" перетворюється на "//evil.com" —
// protocol-relative, тобто чужий домен.
// перетворюється на "//evil.com" — protocol-relative, тобто чужий домен.
// Фільтр же дивився на сирий рядок і цих трьох символів не бачив.
//
// Робоче посилання було: /user/login?redirectTo=/%09/evil.com —
// searchParams.get() декодує %09 у табуляцію ще до перевірки.
//
// Тепер керуючі символи зрізаються ДО перевірки, і назовні йде вже
// вичищений шлях.
describe('керуючі символи всередині шляху', () => {
  const controls: [string, string][] = [
    ['табуляція', String.fromCharCode(9)],
    ['переведення рядка', String.fromCharCode(10)],
    ['повернення каретки', String.fromCharCode(13)],
  ]

  it('передумова: браузер справді викидає ці символи з URL', () => {
    // Не про наш код — про поведінку, на якій тримається обхід.
    for (const [, ch] of controls) {
      expect(targetOrigin(`/${ch}/evil.com`)).toBe('https://evil.com')
    }
  })

  for (const [label, ch] of controls) {
    it(`${label} на початку шляху → дашборд`, () => {
      expect(safeRedirectTarget(`/${ch}/evil.com`)).toBe(FALLBACK)
    })
  }

  it('підсумок — вихід фільтра лишається на нашому origin', () => {
    for (const [, ch] of controls) {
      expect(targetOrigin(safeRedirectTarget(`/${ch}/evil.com`))).toBe(
        'https://zunor.com',
      )
    }
  })
})
