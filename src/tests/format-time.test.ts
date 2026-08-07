import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { formatRelative, formatFull } from '$lib/utils/time'

// Один форматер часу на весь застосунок. До зведення однакова функція жила
// в ШЕСТИ місцях (orders/labels.ts, jobs/display.ts, client-jobs,
// master-feed, notification-list, order-card) і копії вже розійшлись: доба
// назад була то «учора», то «1 дн», то «1 днів тому» — три різні відповіді
// на одне питання на сусідніх екранах.
//
// Тепер варіант один, і саме він тут закріплений: якщо хтось знову заведе
// локальну копію, розбіжність буде видно одразу.

const NOW = new Date('2026-03-15T12:00:00Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('відносний час', () => {
  it('менше хвилини — «щойно»', () => {
    expect(formatRelative(ago(0))).toBe('щойно')
    expect(formatRelative(ago(59_000))).toBe('щойно')
  })

  it('хвилини', () => {
    expect(formatRelative(ago(MIN))).toBe('1 хв тому')
    expect(formatRelative(ago(30 * MIN))).toBe('30 хв тому')
    expect(formatRelative(ago(59 * MIN))).toBe('59 хв тому')
  })

  it('години', () => {
    expect(formatRelative(ago(HOUR))).toBe('1 год тому')
    expect(formatRelative(ago(23 * HOUR))).toBe('23 год тому')
  })

  // Окрема гілка навмисно: «1 дн тому» читається як число, а не як день.
  it('доба назад — «учора», а не «1 дн тому»', () => {
    expect(formatRelative(ago(DAY))).toBe('учора')
    expect(formatRelative(ago(DAY + 5 * HOUR))).toBe('учора')
  })

  it('дні до тижня', () => {
    expect(formatRelative(ago(2 * DAY))).toBe('2 дн тому')
    expect(formatRelative(ago(6 * DAY))).toBe('6 дн тому')
  })

  it('від тижня — конкретна дата', () => {
    const text = formatRelative(ago(7 * DAY))

    expect(text).not.toContain('тому')
    expect(text).toMatch(/берез/)
  })

  it('приймає і Date, і рядок', () => {
    expect(formatRelative(new Date(NOW.getTime() - 30 * MIN))).toBe(
      '30 хв тому',
    )
  })

  // Дата з бази може приїхати битою (міграція, ручна правка) — підпис у
  // картці не привід ронити сторінку.
  it('невалідна дата дає порожній рядок, а не «Invalid Date»', () => {
    expect(formatRelative('не дата')).toBe('')
    expect(formatRelative('')).toBe('')
  })

  // Годинник на пристрої може відставати — тоді подія «з майбутнього».
  it('час із майбутнього не перетворюється на відʼємні хвилини', () => {
    const future = new Date(NOW.getTime() + 10 * MIN).toISOString()

    expect(formatRelative(future)).toBe('щойно')
  })
})

describe('повна дата', () => {
  it('містить день, місяць, рік і час', () => {
    const text = formatFull('2026-03-15T09:30:00Z')

    expect(text).toMatch(/15/)
    expect(text).toMatch(/берез/)
    expect(text).toMatch(/2026/)
    expect(text).toMatch(/\d{2}:\d{2}/)
  })

  it('невалідна дата — порожній рядок', () => {
    expect(formatFull('не дата')).toBe('')
  })
})
