import { describe, it, expect } from 'vitest'
import {
  validateUsername,
  USERNAME_RE,
  RESERVED_USERNAMES,
} from '$lib/username'
import { match as handleMatch } from '../params/handle'

// username — єдине, що людина сама пише в публічну адресу (/@name). Звідси
// два ризики: видати себе за платформу («@admin») і підсунути в маршрут
// щось, чого там бути не має. Перевіряємо саме це, а не зручність.

/** Скорочення: тест майже завжди питає «пустило чи ні». */
const ok = (raw: string) => validateUsername(raw).ok

describe('формат', () => {
  it('нормальний username проходить', () => {
    const r = validateUsername('mihalcann')
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toBe('mihalcann')
  })

  it('нормалізує регістр і пробіли по краях', () => {
    const r = validateUsername('  MiHaLcAnN  ')
    expect(r.ok && r.value).toBe('mihalcann')
  })

  it('межі довжини: 3 і 20 символів включно', () => {
    expect(ok('abc')).toBe(true)
    expect(ok('a'.repeat(20))).toBe(true)
    expect(ok('ab')).toBe(false)
    expect(ok('a'.repeat(21))).toBe(false)
  })

  it('має починатися з латинської літери', () => {
    for (const bad of ['1abc', '_abc', '-abc', '.abc']) {
      expect(ok(bad)).toBe(false)
    }
  })
})

describe('символи, якими ламають маршрут', () => {
  // Роут /[handle=handle] — це шлях. Усе, що може змінити його розбір або
  // піти далі в БД/лог, має відсікатись форматом, а не «якось потім».
  const dangerous = [
    'ad/min', // ще один сегмент шляху
    '../admin', // traversal
    'a%2fb', // закодований слеш
    'a.b', // крапка ламає збіг із matcher'ом
    'a-b', // дефіс не входить у дозволені
    'a b', // пробіл усередині
    'a\tb',
    'a\nb',
    "admin'--", // спроба в SQL-стилі
    '<script>x',
    'user@mail',
    'zunor!',
  ]

  for (const raw of dangerous) {
    it(`${JSON.stringify(raw)} не приймається`, () => {
      expect(ok(raw)).toBe(false)
    })
  }

  // Кирилична «а» виглядає як латинська: без цієї перевірки «@аdmin»
  // був би вільний і візуально не відрізнявся б від «@admin».
  it('гомогліфи (кирилиця) не приймаються', () => {
    expect(ok('аdmin')).toBe(false) // 'а' — U+0430
    expect(ok('zunоr_team')).toBe(false) // 'о' — U+043E
    expect(ok('адмін')).toBe(false)
  })
})

describe('зарезервовані імена', () => {
  it('жодне зарезервоване не можна зайняти', () => {
    for (const name of RESERVED_USERNAMES) {
      const r = validateUsername(name)
      // Частина списку («api», «null») коротша або довша за формат — тоді
      // відмова приходить від регексу, і це так само відмова.
      expect(r.ok).toBe(false)
    }
  })

  it('обхід регістром і пробілами не працює', () => {
    for (const raw of ['Admin', 'ADMIN', '  admin ', 'ZuNoR']) {
      const r = validateUsername(raw)
      expect(r.ok).toBe(false)
      expect(r.ok === false && r.reason).toBe('reserved')
    }
  })

  it('ключі прототипу не рахуються за зарезервовані через Set', () => {
    // Був би тут звичайний об'єкт із `in`, і 'constructor' відсікався б
    // випадково, а 'admin' — ні. Set читає лише власні значення.
    expect(RESERVED_USERNAMES.has('constructor')).toBe(false)
    expect(RESERVED_USERNAMES.has('admin')).toBe(true)
  })
})

// Правила username і matcher маршруту /@handle вже одного разу розійшлися:
// профіль зберігався, а сторінка віддавала 404. Тримаємо їх зведеними тут.
describe('узгодженість із matcher маршруту /@handle', () => {
  const validNames = ['abc', 'mihalcann', 'a'.repeat(20), 'user_1', 'a1_b2_c3']

  it('усе, що можна зберегти, відкривається як /@name', () => {
    for (const name of validNames) {
      expect(ok(name)).toBe(true)
      expect(handleMatch(`@${name}`)).toBe(true)
    }
  })

  it('matcher не пускає те, що не пройшло б валідацію', () => {
    for (const bad of ['ab', 'a'.repeat(21), '1abc', 'a-b', 'a.b', 'a/b']) {
      expect(ok(bad)).toBe(false)
      expect(handleMatch(`@${bad}`)).toBe(false)
    }
  })

  it('matcher вимагає @ — службові шляхи не перехоплюються', () => {
    for (const path of ['dashboard', 'api', 'master', 'privacy', 'terms']) {
      expect(handleMatch(path)).toBe(false)
    }
  })

  it('обидва правила описують один і той самий формат', () => {
    // Пряме звіряння регексів: якщо хтось послабить один, тест впаде.
    for (const name of [...validNames, 'zzz', 'q_9']) {
      expect(USERNAME_RE.test(name)).toBe(handleMatch(`@${name}`))
    }
  })
})
