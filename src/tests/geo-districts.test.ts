import { describe, it, expect } from 'vitest'
import {
  cityDistricts,
  findDistrict,
  districtDistanceKm,
  districtsWithin,
  formatDistance,
  jobPlace,
} from '$lib/geo/districts'
import { distanceKm } from '$lib/geo/distance'
import {
  TRAVEL_OPTIONS,
  TRAVEL_RADII,
  isTravelRadius,
  travelLabel,
} from '$lib/geo/travel'
// Ті самі дані, що кладе в БД prisma/seed-districts.ts.
import { DISTRICTS } from '../../prisma/data/districts'

// Райони — фундамент кілець розсилки. Помилка в координаті не впаде з
// помилкою: майстер просто тихо опиниться «через усе місто» від сусіда.
// Тому тут перевіряється здоровий глузд даних сіду, а не кожна цифра.

const ODESA = cityDistricts(DISTRICTS, 'odesa')

describe('дані сіду: райони Одеси', () => {
  it('не порожній і має і місто, і передмістя', () => {
    expect(ODESA.length).toBeGreaterThan(20)
    expect(ODESA.some((d) => d.group === 'CITY')).toBe(true)
    expect(ODESA.some((d) => d.group === 'SUBURB')).toBe(true)
  })

  // slug — ключ у БД: дубль або кирилиця в ньому зламали б старі записи.
  it('slug унікальний і стабільний (латиниця, цифри, дефіс)', () => {
    const slugs = ODESA.map((d) => d.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('назви унікальні: у списку не буває двох однакових рядків', () => {
    const names = ODESA.map((d) => d.name)
    expect(new Set(names).size).toBe(names.length)
  })

  // Переплутані lat/lng або зайва цифра винесли б район у море чи Молдову.
  it('усі точки — в Одеській агломерації', () => {
    for (const d of ODESA) {
      expect(d.lat).toBeGreaterThan(46.2)
      expect(d.lat).toBeLessThan(46.7)
      expect(d.lng).toBeGreaterThan(30.4)
      expect(d.lng).toBeLessThan(31.2)
    }
  })

  it('місто без районів — порожньо, а не помилка', () => {
    expect(cityDistricts(DISTRICTS, 'mykolaiv')).toEqual([])
    expect(cityDistricts(DISTRICTS, null)).toEqual([])
    expect(findDistrict([], 'center')).toBeNull()
  })

  it('райони одного міста не змішуються з іншим', () => {
    const mixed = [
      ...DISTRICTS,
      { ...ODESA[0], citySlug: 'mykolaiv', slug: 'center' },
    ]
    expect(cityDistricts(mixed, 'odesa')).toHaveLength(ODESA.length)
    expect(cityDistricts(mixed, 'mykolaiv').map((d) => d.slug)).toEqual([
      'center',
    ])
  })
})

describe('відстані', () => {
  const km = (a: string, b: string) => districtDistanceKm(ODESA, a, b)!

  it('формула: градус широти — близько 111 км', () => {
    const d = distanceKm({ lat: 46, lng: 30 }, { lat: 47, lng: 30 })
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(112)
  })

  it('свій район — нуль, і відстань симетрична', () => {
    expect(km('center', 'center')).toBe(0)
    expect(km('center', 'tairova')).toBeCloseTo(km('tairova', 'center'), 9)
  })

  // Порядок, який знає будь-який одесит. Якщо він зламався — зламались дані.
  it('сусіди ближче, ніж протилежні кінці міста', () => {
    expect(km('center', 'moldavanka')).toBeLessThan(km('center', 'arkadiia'))
    expect(km('center', 'arkadiia')).toBeLessThan(km('center', 'tairova'))
    expect(km('tairova', 'raiduzhnyi')).toBeLessThan(km('tairova', 'center'))
    expect(km('kotovskoho', 'chornomorka')).toBeGreaterThan(20)
  })

  it('невідомий район — null, а не нуль', () => {
    expect(districtDistanceKm(ODESA, 'center', null)).toBeNull()
    expect(districtDistanceKm(ODESA, 'center', 'nowhere')).toBeNull()
    expect(districtDistanceKm([], 'center', 'center')).toBeNull()
  })
})

describe('districtsWithin', () => {
  it('від ближчого до дальшого, свій район — першим', () => {
    const list = districtsWithin(ODESA, 'center', 6)
    expect(list[0].slug).toBe('center')
    const dist = list.map((d) => km0(d.slug))
    expect([...dist].sort((a, b) => a - b)).toEqual(dist)
    expect(dist.every((d) => d <= 6)).toBe(true)
  })

  it('без радіуса — усі райони', () => {
    expect(districtsWithin(ODESA, 'center', null)).toHaveLength(ODESA.length)
  })

  it('невідомий район — порожньо', () => {
    expect(districtsWithin(ODESA, 'nowhere', 5)).toEqual([])
  })

  function km0(slug: string) {
    return districtDistanceKm(ODESA, 'center', slug)!
  }
})

describe('підписи', () => {
  it('formatDistance: свій район словами, далі — цілі кілометри', () => {
    expect(formatDistance(0)).toBe('ваш район')
    expect(formatDistance(0.3)).toBe('ваш район')
    expect(formatDistance(0.7)).toBe('≈1 км')
    expect(formatDistance(4.4)).toBe('≈4 км')
    expect(formatDistance(12.6)).toBe('≈13 км')
  })

  it('jobPlace: назва району й відстань з точністю до десятої', () => {
    const p = jobPlace(ODESA, 'tairova', 'center')
    expect(p.district).toBe('Таїрова')
    expect(p.distanceKm).toBe(Math.round(p.distanceKm! * 10) / 10)
    expect(jobPlace(ODESA, 'tairova', null).distanceKm).toBeNull()
    expect(jobPlace(ODESA, null, 'center')).toEqual({
      district: null,
      distanceKm: null,
    })
  })
})

describe('радіус виїзду', () => {
  // Форма й сервер мусять погоджуватись: варіант із форми, який сервер
  // відхиляє, — це онбординг, який неможливо завершити.
  it('кожен варіант із форми приймається сервером', () => {
    for (const o of TRAVEL_OPTIONS) expect(isTravelRadius(o.value)).toBe(true)
    expect(TRAVEL_OPTIONS.map((o) => o.value)).toEqual([...TRAVEL_RADII, null])
  })

  it('решта значень відхиляється', () => {
    for (const v of [0, 7, -5, '5', undefined, 'будь-де', 1e9]) {
      expect(isTravelRadius(v)).toBe(false)
    }
  })

  it('підпис для кожного значення', () => {
    expect(travelLabel(5)).toBe('До 5 км')
    expect(travelLabel(null)).toBe('Будь-де')
  })
})
