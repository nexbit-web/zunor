import { describe, it, expect } from 'vitest'
import {
  ringRadius,
  withinRadius,
  acceptsDistance,
} from '$lib/server/dispatch/core/rings'
import { DISPATCH_CONFIG } from '$lib/server/dispatch/config'
import type { Candidate } from '$lib/server/dispatch/types'

// Кільця розсилки — чиста логіка без БД. Інтеграцію з диспетчером (хто
// реально потрапляє у хвилю) перевіряє dispatch-engine.test.ts; тут —
// краї, які там незручно ловити.

const { WAVES, MIN_RING_CANDIDATES: MIN } = DISPATCH_CONFIG
const radii = WAVES.map((w) => w.radiusKm)

function at(distanceKm: number | null, id = 'm'): Candidate {
  return {
    id,
    lastSeen: new Date(),
    avgRating: 0,
    isVerified: false,
    activeOrders: 0,
    masterSince: new Date(0),
    completedOrders: 100,
    responseRate: 0.5,
    recentNotifications: 0,
    withinReach: true,
    distanceKm,
  }
}

const many = (n: number, km: number | null) =>
  Array.from({ length: n }, (_, i) => at(km, `m${i}`))

describe('конфіг кілець', () => {
  // Без цього «коло ширшає з часом» перестає бути правдою непомітно.
  it('радіуси ростуть від хвилі до хвилі, а остання — усе місто', () => {
    const finite = radii.slice(0, -1) as number[]
    for (let i = 1; i < finite.length; i++) {
      expect(finite[i]).toBeGreaterThan(finite[i - 1])
    }
    expect(radii.at(-1)).toBeNull()
  })

  it('хвилі йдуть за часом по черзі', () => {
    const times = WAVES.map((w) => w.afterMinutes)
    expect(times[0]).toBe(0)
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1])
    }
  })
})

describe('withinRadius', () => {
  it('межа радіуса входить у кільце', () => {
    expect(withinRadius(at(3), 3)).toBe(true)
    expect(withinRadius(at(3.01), 3)).toBe(false)
  })

  it('невідома відстань — лише в «усе місто»', () => {
    expect(withinRadius(at(null), 1000)).toBe(false)
    expect(withinRadius(at(null), null)).toBe(true)
  })
})

describe('acceptsDistance — межа самого майстра', () => {
  it('далі за межу — ні, у межах — так', () => {
    expect(acceptsDistance(4.9, 5)).toBe(true)
    expect(acceptsDistance(5, 5)).toBe(true)
    expect(acceptsDistance(5.1, 5)).toBe(false)
  })

  // Перевірити межу нема чим — заявка не має пропасти через порожнє поле.
  it('невідома відстань або «будь-де» — кличемо', () => {
    expect(acceptsDistance(null, 5)).toBe(true)
    expect(acceptsDistance(40, null)).toBe(true)
  })
})

describe('ringRadius', () => {
  it('заявка без району — кілець немає', () => {
    expect(ringRadius(1, many(10, 0), false)).toBeNull()
  })

  it('досить людей поруч — перша хвиля лишається в першому кільці', () => {
    expect(ringRadius(1, many(MIN, 0), true)).toBe(radii[0])
  })

  it('кожна хвиля стартує зі свого кільця', () => {
    for (let wave = 1; wave <= WAVES.length; wave++) {
      expect(ringRadius(wave, many(MIN, 0), true)).toBe(radii[wave - 1])
    }
  })

  it('порожнє кільце пропускається до першого, де є кого кликати', () => {
    const second = radii[1] as number
    expect(ringRadius(1, many(MIN, second), true)).toBe(second)
  })

  it('на одного менше порога — теж розширюємо', () => {
    const pool = [...many(MIN - 1, 0), ...many(MIN, radii[1] as number)]
    expect(ringRadius(1, pool, true)).toBe(radii[1])
  })

  it('нікого в жодному скінченному кільці — усе місто', () => {
    expect(ringRadius(1, many(MIN, null), true)).toBeNull()
    expect(ringRadius(1, many(MIN, 10_000), true)).toBeNull()
    expect(ringRadius(1, [], true)).toBeNull()
  })

  it('номер хвилі поза розкладом не ламає розрахунок', () => {
    expect(ringRadius(0, many(MIN, 0), true)).toBe(radii[0])
    expect(ringRadius(99, many(MIN, 0), true)).toBeNull()
  })
})
