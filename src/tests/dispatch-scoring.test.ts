import { describe, it, expect } from 'vitest'
import {
  scoreCandidate,
  isNewMaster,
  responseRate,
  scoreAll,
} from '$lib/server/dispatch/scoring'
import { DISPATCH_CONFIG } from '$lib/server/dispatch/types'
import type { Candidate } from '$lib/server/dispatch/types'

// Scoring — це не технічна деталь, а продуктове УТП: справедливий розподіл
// заявок (новачок має шанс, «зірку» не бомбимо). Тести перевіряють саме ці
// обіцянки, а не конкретні числа балів — числа можна крутити, поведінку ні.

const NOW = new Date('2026-08-05T12:00:00Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60_000)

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 'm',
    isOnline: false,
    lastSeen: daysAgo(30),
    avgRating: 0,
    isVerified: false,
    activeOrders: 0,
    // Ветеран за замовчуванням: старший за NEW_MASTER_DAYS і має достатньо
    // виконаних замовлень — інакше boost новачка тягнувся б у кожен тест.
    masterSince: daysAgo(DISPATCH_CONFIG.NEW_MASTER_DAYS + 10),
    completedOrders: DISPATCH_CONFIG.NEW_MASTER_ORDERS + 1,
    responseRate: 0.5,
    recentNotifications: 0,
    ...over,
  }
}

describe('свіжість lastSeen, а не прапорець isOnline', () => {
  it('isOnline=false, але щойно бачили → рахується як онлайн', () => {
    const justSeen = scoreCandidate(
      candidate({ isOnline: false, lastSeen: minutesAgo(1) }),
      NOW,
    )
    const longGone = scoreCandidate(
      candidate({ isOnline: false, lastSeen: daysAgo(30) }),
      NOW,
    )
    expect(justSeen).toBeGreaterThan(longGone)
  })

  it('isOnline=true нічого не додає, якщо lastSeen давній', () => {
    const stale = candidate({ isOnline: true, lastSeen: daysAgo(30) })
    const staleOffline = candidate({ isOnline: false, lastSeen: daysAgo(30) })
    expect(scoreCandidate(stale, NOW)).toBe(scoreCandidate(staleOffline, NOW))
  })

  it('що свіжіший lastSeen — то вищий бал, монотонно', () => {
    const scores = [1, 20, 45, 120, 60 * 20, 60 * 48].map((m) =>
      scoreCandidate(candidate({ lastSeen: minutesAgo(m) }), NOW),
    )
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1])
    }
  })
})

describe('boost новачка', () => {
  it('новий за датою реєстрації', () => {
    const c = candidate({
      masterSince: daysAgo(1),
      completedOrders: DISPATCH_CONFIG.NEW_MASTER_ORDERS + 100,
    })
    expect(isNewMaster(c, NOW)).toBe(true)
  })

  it('новий за кількістю виконаних, навіть якщо давно зареєстрований', () => {
    const c = candidate({
      masterSince: daysAgo(365),
      completedOrders: DISPATCH_CONFIG.NEW_MASTER_ORDERS - 1,
    })
    expect(isNewMaster(c, NOW)).toBe(true)
  })

  it('ветеран boost не отримує', () => {
    expect(isNewMaster(candidate(), NOW)).toBe(false)
  })

  it('новачок обходить рівного ветерана', () => {
    const rookie = scoreCandidate(candidate({ masterSince: daysAgo(1) }), NOW)
    expect(rookie).toBeGreaterThan(scoreCandidate(candidate(), NOW))
  })
})

describe('баланс навантаження', () => {
  it('перевантажений майстер отримує штраф', () => {
    const busy = candidate({
      activeOrders: DISPATCH_CONFIG.MAX_ACTIVE_ORDERS,
    })
    expect(scoreCandidate(busy, NOW)).toBeLessThan(
      scoreCandidate(candidate(), NOW),
    )
  })

  it('штраф спрацьовує саме НА порозі, не після нього', () => {
    const atLimit = candidate({
      activeOrders: DISPATCH_CONFIG.MAX_ACTIVE_ORDERS,
    })
    const belowLimit = candidate({
      activeOrders: DISPATCH_CONFIG.MAX_ACTIVE_ORDERS - 1,
    })
    expect(scoreCandidate(atLimit, NOW)).toBeLessThan(
      scoreCandidate(belowLimit, NOW),
    )
  })

  it('«зірка» під лавиною заявок опускається нижче свіжого новачка', () => {
    // Маніфест: під сплеском робота розкидається, а не йде одному.
    const star = candidate({
      lastSeen: minutesAgo(1),
      avgRating: 5,
      isVerified: true,
      responseRate: 1,
      recentNotifications: 5,
    })
    const rookie = candidate({
      lastSeen: minutesAgo(1),
      masterSince: daysAgo(1),
      completedOrders: 0,
    })
    expect(scoreCandidate(star, NOW)).toBeLessThan(scoreCandidate(rookie, NOW))
  })

  it('без недавніх розсилок штрафу немає', () => {
    const a = candidate({ recentNotifications: 0 })
    const b = candidate({ recentNotifications: 1 })
    expect(scoreCandidate(a, NOW)).toBeGreaterThan(scoreCandidate(b, NOW))
  })
})

describe('responseRate (згладжування Лапласа)', () => {
  it('без історії ≈ 0.5 — новачка не карають за брак даних', () => {
    expect(responseRate(0, 0)).toBe(0.5)
  })

  it('стабільно відповідає → прямує до 1, але не досягає', () => {
    const rate = responseRate(100, 100)
    expect(rate).toBeGreaterThan(0.95)
    expect(rate).toBeLessThan(1)
  })

  it('ігнорує розсилки → прямує до 0, але не досягає', () => {
    const rate = responseRate(100, 0)
    expect(rate).toBeLessThan(0.05)
    expect(rate).toBeGreaterThan(0)
  })

  it('одна відповідь із однієї краща за нуль із однієї', () => {
    expect(responseRate(1, 1)).toBeGreaterThan(responseRate(1, 0))
  })
})

describe('стійкість до порожніх полів', () => {
  it('undefined у числових полях не дає NaN', () => {
    // Один undefined із БД не має ламати сортування всього списку.
    const broken = {
      ...candidate(),
      avgRating: undefined,
      responseRate: undefined,
      activeOrders: undefined,
      recentNotifications: undefined,
    } as unknown as Candidate

    expect(Number.isNaN(scoreCandidate(broken, NOW))).toBe(false)
  })
})

describe('scoreAll', () => {
  it('сортує за спаданням і зберігає всіх кандидатів', () => {
    const list = [
      candidate({ id: 'cold', lastSeen: daysAgo(30) }),
      candidate({ id: 'hot', lastSeen: minutesAgo(1) }),
      candidate({ id: 'warm', lastSeen: minutesAgo(45) }),
    ]
    const scored = scoreAll(list, NOW)

    expect(scored.map((s) => s.id)).toEqual(['hot', 'warm', 'cold'])
    expect(scored).toHaveLength(3)
  })

  it('порожній список → порожній результат', () => {
    expect(scoreAll([], NOW)).toEqual([])
  })
})
