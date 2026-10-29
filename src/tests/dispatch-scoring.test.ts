import { describe, it, expect } from 'vitest'
import {
  dispatchScore,
  isNewMaster,
  responseRate,
  rankCandidates,
  proximityBonus,
  travelDistance,
  busyTravelPenalty,
  crewFit,
} from '$lib/server/dispatch/core/score'
import { DISPATCH_CONFIG } from '$lib/server/dispatch/config'
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
    withinReach: true,
    distanceKm: null,
    ...over,
  }
}

// Онлайн визначає свіжість lastSeen: прапорець isOnline не скидається при
// виході, тому в бал він не потрапляє взагалі.
describe('свіжість за lastSeen', () => {
  it('щойно бачили → рахується як онлайн', () => {
    const justSeen = dispatchScore(candidate({ lastSeen: minutesAgo(1) }), NOW)
    const longGone = dispatchScore(candidate({ lastSeen: daysAgo(30) }), NOW)
    expect(justSeen).toBeGreaterThan(longGone)
  })

  it('що свіжіший lastSeen — то вищий бал, монотонно', () => {
    const scores = [1, 20, 45, 120, 60 * 20, 60 * 48].map((m) =>
      dispatchScore(candidate({ lastSeen: minutesAgo(m) }), NOW),
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
    const rookie = dispatchScore(candidate({ masterSince: daysAgo(1) }), NOW)
    expect(rookie).toBeGreaterThan(dispatchScore(candidate(), NOW))
  })
})

describe('баланс навантаження', () => {
  it('перевантажений майстер отримує штраф', () => {
    const busy = candidate({
      activeOrders: DISPATCH_CONFIG.MAX_ACTIVE_ORDERS,
    })
    expect(dispatchScore(busy, NOW)).toBeLessThan(
      dispatchScore(candidate(), NOW),
    )
  })

  it('штраф спрацьовує саме НА порозі, не після нього', () => {
    const atLimit = candidate({
      activeOrders: DISPATCH_CONFIG.MAX_ACTIVE_ORDERS,
    })
    const belowLimit = candidate({
      activeOrders: DISPATCH_CONFIG.MAX_ACTIVE_ORDERS - 1,
    })
    expect(dispatchScore(atLimit, NOW)).toBeLessThan(
      dispatchScore(belowLimit, NOW),
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
    expect(dispatchScore(star, NOW)).toBeLessThan(dispatchScore(rookie, NOW))
  })

  it('без недавніх розсилок штрафу немає', () => {
    const a = candidate({ recentNotifications: 0 })
    const b = candidate({ recentNotifications: 1 })
    expect(dispatchScore(a, NOW)).toBeGreaterThan(dispatchScore(b, NOW))
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

    expect(Number.isNaN(dispatchScore(broken, NOW))).toBe(false)
  })
})

describe('rankCandidates', () => {
  it('сортує за спаданням і зберігає всіх кандидатів', () => {
    const list = [
      candidate({ id: 'cold', lastSeen: daysAgo(30) }),
      candidate({ id: 'hot', lastSeen: minutesAgo(1) }),
      candidate({ id: 'warm', lastSeen: minutesAgo(45) }),
    ]
    const scored = rankCandidates(list, NOW)

    expect(scored.map((s) => s.id)).toEqual(['hot', 'warm', 'cold'])
    expect(scored).toHaveLength(3)
  })

  it('порожній список → порожній результат', () => {
    expect(rankCandidates([], NOW)).toEqual([])
  })
})

describe('близькість', () => {
  // Обіцянка схеми з кільцями: з двох рівних першим іде той, хто ближче.
  it('ближчий майстер вищий за дальшого за рівних умов', () => {
    const near = dispatchScore(candidate({ distanceKm: 1 }), NOW)
    const far = dispatchScore(candidate({ distanceKm: 12 }), NOW)
    expect(near).toBeGreaterThan(far)
  })

  it('що далі — то менший бонус, монотонно, і не нижче нуля', () => {
    const bonuses = [0, 2, 5, 10, 19, 40, 500].map((km) => proximityBonus(km))
    for (let i = 1; i < bonuses.length; i++) {
      expect(bonuses[i]).toBeLessThanOrEqual(bonuses[i - 1])
    }
    expect(bonuses.at(-1)).toBe(0)
  })

  // «Невідомо» не дорівнює «далеко»: без району майстра не карають, просто
  // не дають бонусу. Старі профілі не мають провалитися на дно.
  it('невідома відстань — без бонусу, але й без штрафу', () => {
    const unknown = dispatchScore(candidate({ distanceKm: null }), NOW)
    const veryFar = dispatchScore(candidate({ distanceKm: 500 }), NOW)
    expect(unknown).toBe(veryFar)
    expect(proximityBonus(Number.NaN)).toBe(0)
  })

  // Близькість впорядковує, але не перекриває швидкість: майстер онлайн за
  // 8 км важливіший за того, хто поруч, але зник тиждень тому.
  it('онлайн за кілька кілометрів обходить зниклого сусіда', () => {
    const onlineFar = candidate({ lastSeen: minutesAgo(1), distanceKm: 8 })
    const goneNear = candidate({ lastSeen: daysAgo(7), distanceKm: 0 })
    expect(dispatchScore(onlineFar, NOW)).toBeGreaterThan(
      dispatchScore(goneNear, NOW),
    )
  })

  it('відстань доїжджає в результат rankCandidates — для журналу розсилки', () => {
    const [scored] = rankCandidates(
      [candidate({ id: 'm1', distanceKm: 3.2 })],
      NOW,
    )
    expect(scored.distanceKm).toBe(3.2)
  })
})

// Авто, зайнятість і команда (анкета майстра → MasterProfile.metadata).
// Обіцянки з продукту: з авто «далеко» коротше; зайнятому без авто не
// шлемо через усе місто; на великий обʼєкт першою йде команда.
describe('дорога, зайнятість і команда', () => {
  it('з авто за два райони не гірший за сусіда без авто', () => {
    const neighbour = candidate({ distanceKm: 3, travelKm: 3 })
    const withCar = candidate({ distanceKm: 6, travelKm: 3 })
    expect(dispatchScore(withCar, NOW)).toBe(dispatchScore(neighbour, NOW))
  })

  it('без авто дальній програє ближчому — як і раніше', () => {
    const near = candidate({ distanceKm: 3, travelKm: 3 })
    const far = candidate({ distanceKm: 6, travelKm: 6 })
    expect(dispatchScore(near, NOW)).toBeGreaterThan(dispatchScore(far, NOW))
  })

  it('travelKm не задано — рахується від distanceKm, як до анкети', () => {
    expect(travelDistance({ distanceKm: 7 })).toBe(7)
    expect(travelDistance({ distanceKm: 7, travelKm: 3.5 })).toBe(3.5)
    expect(travelDistance({ distanceKm: null, travelKm: undefined })).toBeNull()
  })

  it('вільному дорога нічого не коштує понад близькість', () => {
    expect(busyTravelPenalty(0, 15)).toBe(0)
  })

  it('зайнятому далека дорога коштує більше, ніж близька', () => {
    expect(busyTravelPenalty(2, 9)).toBeLessThan(busyTravelPenalty(2, 2))
    expect(busyTravelPenalty(2, 2)).toBeLessThan(0)
  })

  it('що більше замовлень на руках, то дорожча дорога', () => {
    expect(busyTravelPenalty(2, 8)).toBeLessThan(busyTravelPenalty(1, 8))
  })

  it('зайнятий без авто далеко програє такому ж зайнятому з авто', () => {
    const noCar = candidate({ activeOrders: 2, distanceKm: 8, travelKm: 8 })
    const car = candidate({ activeOrders: 2, distanceKm: 8, travelKm: 4 })
    expect(dispatchScore(car, NOW)).toBeGreaterThan(dispatchScore(noCar, NOW))
  })

  it('невідома відстань — без штрафу за дорогу', () => {
    expect(busyTravelPenalty(2, null)).toBe(0)
  })
})

// Формат роботи під обсяг заявки: на дуже велике першими — компанії й
// бригади, на невелике — ті, хто працює сам. Перевіряється порядок, а не
// числа: ваги в DISPATCH_CONFIG.CREW_FIT крутити можна.
describe('формат роботи під обсяг заявки (crewFit)', () => {
  const score = (
    crew: 'SOLO' | 'TEAM' | 'COMPANY' | null,
    effort: number | null,
  ) => dispatchScore(candidate({ crewFit: crewFit(crew, effort) }), NOW)

  it('дуже велике (9–10): компанія > бригада > одинак', () => {
    expect(score('COMPANY', 10)).toBeGreaterThan(score('TEAM', 10))
    expect(score('TEAM', 9)).toBeGreaterThan(score('SOLO', 9))
  })

  it('велике (7–8): бригада й компанія обходять одинака', () => {
    expect(score('TEAM', 8)).toBeGreaterThan(score('SOLO', 8))
    expect(score('COMPANY', 7)).toBeGreaterThan(score('SOLO', 7))
  })

  it('невелике (1–3): одинак > бригада > компанія', () => {
    expect(score('SOLO', 2)).toBeGreaterThan(score('TEAM', 2))
    expect(score('TEAM', 3)).toBeGreaterThan(score('COMPANY', 3))
  })

  it('середнє (4–6): формат не важить', () => {
    expect(score('SOLO', 5)).toBe(score('TEAM', 5))
    expect(score('TEAM', 5)).toBe(score('COMPANY', 5))
  })

  it('невідомий формат (старий профіль) чи обсяг — ні штрафу, ні переваги', () => {
    expect(crewFit(null, 10)).toBe(0)
    expect(crewFit(undefined, 2)).toBe(0)
    expect(crewFit('COMPANY', null)).toBe(0)
  })

  // Мʼяко, а не фільтр: живий одинак не програє бригаді, яку не бачили добу.
  it('одинак онлайн обходить бригаду, яку давно не бачили, навіть на великому', () => {
    const solo = candidate({
      crewFit: crewFit('SOLO', 8),
      lastSeen: minutesAgo(1),
    })
    const team = candidate({
      crewFit: crewFit('TEAM', 8),
      lastSeen: daysAgo(2),
    })
    expect(dispatchScore(solo, NOW)).toBeGreaterThan(dispatchScore(team, NOW))
  })
})
