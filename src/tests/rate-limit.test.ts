import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { limit } from '$lib/server/rate-limit'

// Це єдиний захист від перебору пароля, спаму заявок і накрутки рахунку
// DeepSeek (/api/zunor/chat — 20/хв і 200/добу). Тому тести перевіряють не
// «щось рахується», а конкретні обіцянки: ліміт справді зупиняє, чужий
// лічильник не чіпає, сам звільняється і не з'їдає пам'ять процесу.
//
// buckets живуть у пам'яті модуля і спільні на весь файл, тож кожен тест
// бере власний ключ. Час підмінюємо фейковим: інакше перевірка вікна
// означала б реальний sleep.

const HOUR = 60 * 60_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ліміт зупиняє', () => {
  it('пропускає рівно points запитів, наступний відхиляє', () => {
    const key = 'test:exact'
    const opts = { points: 3, duration: 60_000 }

    expect(limit(key, opts).success).toBe(true)
    expect(limit(key, opts).success).toBe(true)
    expect(limit(key, opts).success).toBe(true)
    expect(limit(key, opts).success).toBe(false)
    expect(limit(key, opts).success).toBe(false)
  })

  it('remaining показує залишок і не йде в мінус', () => {
    const key = 'test:remaining'
    const opts = { points: 2, duration: 60_000 }

    expect(limit(key, opts).remaining).toBe(1)
    expect(limit(key, opts).remaining).toBe(0)
    expect(limit(key, opts).remaining).toBe(0)
  })
})

describe('ключі ізольовані', () => {
  // Ключі user-scoped: якби вони протікали, один спамер вимикав би сервіс
  // усім іншим — це вже не захист, а кнопка «покласти застосунок».
  it('вичерпаний ліміт одного ключа не блокує сусідній', () => {
    const opts = { points: 1, duration: 60_000 }

    expect(limit('test:iso:a', opts).success).toBe(true)
    expect(limit('test:iso:a', opts).success).toBe(false)
    expect(limit('test:iso:b', opts).success).toBe(true)
  })
})

describe('вікно звільняється саме', () => {
  it('після duration лічильник починається з нуля', () => {
    const key = 'test:window'
    const opts = { points: 1, duration: 60_000 }

    expect(limit(key, opts).success).toBe(true)

    vi.advanceTimersByTime(59_000)
    expect(limit(key, opts).success).toBe(false)

    vi.advanceTimersByTime(2_000)
    expect(limit(key, opts).success).toBe(true)
  })

  // Якби відмова подовжувала вікно, будь-хто, знаючи чужий userId у
  // публічному профілі, тримав би людину в блоці нескінченно.
  it('відмови не подовжують вікно — заблокувати назавжди не вийде', () => {
    const key = 'test:no-extend'
    const opts = { points: 1, duration: 60_000 }

    const first = limit(key, opts)
    vi.advanceTimersByTime(30_000)

    for (let i = 0; i < 50; i++) limit(key, opts)

    const blocked = limit(key, opts)
    expect(blocked.success).toBe(false)
    expect(blocked.resetAt).toBe(first.resetAt)

    vi.advanceTimersByTime(31_000)
    expect(limit(key, opts).success).toBe(true)
  })
})

describe('ВІДОМА ВЛАСТИВІСТЬ: вікно фіксоване, не ковзне', () => {
  // Не баг, а свідомий компроміс — але знати про нього треба: на межі
  // двох вікон проходить подвійна порція. Для job:create (10/год) це
  // означає 20 заявок за секунди. Якщо колись стане боляче — лікується
  // ковзним вікном, а не збільшенням duration.
  it('на межі вікон проходить 2× points майже одночасно', () => {
    const key = 'test:boundary'
    const opts = { points: 2, duration: 60_000 }

    expect(limit(key, opts).success).toBe(true)
    vi.advanceTimersByTime(59_000)
    expect(limit(key, opts).success).toBe(true)

    // Вікно щойно спливло — і одразу доступні всі points знову.
    vi.advanceTimersByTime(2_000)
    expect(limit(key, opts).success).toBe(true)
    expect(limit(key, opts).success).toBe(true)
    expect(limit(key, opts).success).toBe(false)
  })
})

// Має лишатись ОСТАННІМ у файлі: тест навмисно переповнює Map і витісняє
// ключі попередніх тестів.
describe("пам'ять має стелю", () => {
  // Процес один на весь застосунок (adapter-node), тож Map без стелі — це
  // не витік, а спосіб покласти сервіс. MAX_BUCKETS = 20 000.
  it('старі кошики витісняються, Map не росте безмежно', () => {
    const opts = { points: 1, duration: HOUR }
    const probe = 'test:probe'

    expect(limit(probe, opts).success).toBe(true)
    expect(limit(probe, opts).success).toBe(false) // ліміт живий

    // Заповнюємо з запасом, щоб probe гарантовано вилетів як найстаріший
    // незалежно від того, скільки ключів лишили тести вище.
    for (let i = 0; i < 20_100; i++) limit(`test:flood:${i}`, opts)

    // Якби стелі не було, probe лишився б у Map і далі відмовляв.
    expect(limit(probe, opts).success).toBe(true)
  })
})
