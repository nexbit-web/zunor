import { describe, it, expect } from 'vitest'
import { cleaningEffort, cleaningHours } from '$lib/categories/cleaning/effort'
import {
  EFFORT_MAX,
  EFFORT_MIN,
  asEffort,
  effortFromHours,
  effortTier,
  parseEffortAdjust,
} from '$lib/categories/effort'
import { validateCleaningMetadata } from '$lib/categories/cleaning/validate'

// Обсяг заявки вирішує, кого розсилка кличе першим: на кухню — тих, хто
// працює сам, на будинок — бригади й компанії. Перевіряється ПОРЯДОК
// («кухня менша за будинок»), а не години: числа у формулі крутити можна,
// а от обіцянку «більша робота — більший бал» — ні.

const apt = (service: string, rooms: string, extra = {}) => ({
  premise: 'apartment',
  service,
  when: 'tomorrow',
  rooms,
  ...extra,
})
const tier = (m: unknown) => effortTier(cleaningEffort(m)!)

describe('шкала 1–10', () => {
  it('бал не виходить за межі, години → бал не спадають', () => {
    let prev = 0
    for (let h = 0; h <= 60; h += 0.25) {
      const e = effortFromHours(h)
      expect(e).toBeGreaterThanOrEqual(EFFORT_MIN)
      expect(e).toBeLessThanOrEqual(EFFORT_MAX)
      expect(e).toBeGreaterThanOrEqual(prev)
      prev = e
    }
    expect(effortFromHours(NaN)).toBe(EFFORT_MIN)
    expect(effortFromHours(1000)).toBe(EFFORT_MAX)
  })

  it('рівні: 1–3 невелике, 4–6 середнє, 7–8 велике, 9–10 дуже велике', () => {
    expect([1, 3, 4, 6, 7, 8, 9, 10].map(effortTier)).toEqual([
      'small',
      'small',
      'medium',
      'medium',
      'large',
      'large',
      'xlarge',
      'xlarge',
    ])
  })

  it('з бази — лише ціле 1–10, решта — «невідомо»', () => {
    expect(asEffort(7)).toBe(7)
    for (const bad of [0, 11, 5.5, '5', null, undefined]) {
      expect(asEffort(bad)).toBeNull()
    }
  })
})

describe('обсяг прибирання', () => {
  // Приклади, з яких виросла ідея: вони мусять лягати у свої рівні.
  it('кухня — невелике, будинок і вітрини в ТЦ — дуже велике', () => {
    expect(tier(apt('standard', '1', { areaM2: 12 }))).toBe('small')
    expect(tier(apt('standard', '1'))).toBe('small')
    expect(tier(apt('deep', '2'))).toBe('medium')
    expect(tier(apt('post-renovation', '3', { trash: 'needs-removal' }))).toBe(
      'large',
    )
    // Будинок на три поверхи, шість спалень.
    expect(
      tier({ premise: 'house', service: 'deep', rooms: '4plus', areaM2: 300 }),
    ).toBe('xlarge')
    // Великі панорамні вікна в торговому центрі.
    expect(
      tier({
        premise: 'commercial',
        service: 'windows',
        windowsCount: 20,
        windowSide: 'both',
      }),
    ).toBe('xlarge')
  })

  it('більше кімнат — не менший обсяг', () => {
    const rooms = ['1', '2', '3', '4plus'].map((r) =>
      cleaningHours(apt('deep', r)),
    )
    expect(rooms).toEqual([...rooms].sort((a, b) => a - b))
  })

  it('генеральне важче за звичайне, після ремонту — за генеральне', () => {
    const h = (s: string) => cleaningHours(apt(s, '2'))
    expect(h('deep')).toBeGreaterThan(h('standard'))
    expect(h('post-renovation')).toBeGreaterThan(h('deep'))
  })

  it('будинок важчий за квартиру з тими ж кімнатами', () => {
    expect(
      cleaningHours({ premise: 'house', service: 'deep', rooms: '3' }),
    ).toBeGreaterThan(cleaningHours(apt('deep', '3')))
  })

  // Площа точніша за кімнати: «4+ кімнати» на 30 м² — це не маєток.
  it('названа площа важить більше за кімнати', () => {
    expect(cleaningEffort(apt('deep', '4plus', { areaM2: 30 }))).toBeLessThan(
      cleaningEffort(apt('deep', '1', { areaM2: 200 }))!,
    )
  })

  it('вітрини в ТЦ важчі за ті самі вікна вдома; ззовні на висоті — важче', () => {
    const win = (extra = {}) => ({
      premise: 'apartment',
      service: 'windows',
      windowsCount: 6,
      windowSide: 'outside',
      ...extra,
    })
    expect(cleaningHours(win({ premise: 'commercial' }))).toBeGreaterThan(
      cleaningHours(win()),
    )
    expect(cleaningHours(win({ floor: 9 }))).toBeGreaterThan(
      cleaningHours(win({ floor: 1 })),
    )
    // Зсередини висота не заважає.
    expect(cleaningHours(win({ windowSide: 'inside', floor: 9 }))).toBe(
      cleaningHours(win({ windowSide: 'inside', floor: 1 })),
    )
  })

  it('вивезти сміття, поверх без ліфта й балкон додають роботи', () => {
    const base = apt('post-renovation', '2', { trash: 'removed' })
    expect(cleaningHours({ ...base, trash: 'needs-removal' })).toBeGreaterThan(
      cleaningHours(base),
    )
    expect(
      cleaningHours({ ...base, floor: 9, hasElevator: 'no' }),
    ).toBeGreaterThan(cleaningHours({ ...base, floor: 9, hasElevator: 'yes' }))
    expect(
      cleaningHours(apt('deep', '2', { balcony: 'panoramic' })),
    ).toBeGreaterThan(cleaningHours(apt('deep', '2', { balcony: 'none' })))
  })

  it('хімчистка: кутовий диван важчий за 2-місний, більше предметів — більше', () => {
    const sofa = (items: unknown[]) => ({
      premise: 'apartment',
      service: 'sofa',
      items,
    })
    expect(
      cleaningHours(sofa([{ type: 'sofa', variant: 'corner', qty: 1 }])),
    ).toBeGreaterThan(
      cleaningHours(sofa([{ type: 'sofa', variant: '2', qty: 1 }])),
    )
    expect(cleaningHours(sofa([{ type: 'armchair', qty: 4 }]))).toBeGreaterThan(
      cleaningHours(sofa([{ type: 'armchair', qty: 1 }])),
    )
  })

  it('поправка асистента — на крок, і не за межі шкали', () => {
    const base = apt('deep', '2')
    const e = cleaningEffort(base)!
    expect(cleaningEffort({ ...base, effortAdjust: 1 })).toBe(e + 1)
    expect(cleaningEffort({ ...base, effortAdjust: -1 })).toBe(e - 1)
    // Більше за крок не приймаємо: поправка йде через браузер клієнта.
    expect(cleaningEffort({ ...base, effortAdjust: 5 })).toBe(e)
    // Найменша заявка (один стілець) мінус крок — однаково 1, не 0.
    expect(
      cleaningEffort({
        premise: 'apartment',
        service: 'sofa',
        items: [{ type: 'chairs', qty: 1 }],
        effortAdjust: -1,
      }),
    ).toBe(EFFORT_MIN)
    expect(
      cleaningEffort({
        premise: 'house',
        service: 'post-renovation',
        areaM2: 1000,
        effortAdjust: 1,
      }),
    ).toBe(EFFORT_MAX)
  })

  // Названа площа вже каже «маленьке» — −1 зверху рахував би це двічі.
  it('з названою площею −1 не діє, +1 — діє', () => {
    const kitchen = apt('deep', '1', { areaM2: 20 })
    const e = cleaningEffort(kitchen)!
    expect(cleaningEffort({ ...kitchen, effortAdjust: -1 })).toBe(e)
    expect(cleaningEffort({ ...kitchen, effortAdjust: 1 })).toBe(e + 1)
    // Без площі −1 працює як і раніше.
    const noArea = apt('deep', '2')
    expect(cleaningEffort({ ...noArea, effortAdjust: -1 })).toBe(
      cleaningEffort(noArea)! - 1,
    )
  })

  it('битий metadata чи невідома послуга — «невідомо» (null), а не «невелике»', () => {
    expect(cleaningEffort(null)).toBeNull()
    expect(cleaningEffort('рядок')).toBeNull()
    expect(cleaningEffort({ premise: 'house', rooms: '4plus' })).toBeNull()
    expect(cleaningEffort({ service: 'teleportation' })).toBeNull()
  })
})

describe('валідація: площа й поправка', () => {
  const valid = (extra: Record<string, unknown>) =>
    validateCleaningMetadata({
      premise: 'apartment',
      service: 'deep',
      when: 'tomorrow',
      rooms: '2',
      ...extra,
    })

  it('площа зберігається цілим числом у розумних межах', () => {
    expect(valid({ areaM2: 55 }).clean?.areaM2).toBe(55)
    expect(valid({ areaM2: '70' }).clean?.areaM2).toBe(70)
    for (const bad of [0, -5, 12.5, 1_000_000, 'багато']) {
      const r = valid({ areaM2: bad })
      // Погана площа не валить заявку — просто не зберігається.
      expect(r.ok).toBe(true)
      expect(r.clean?.areaM2).toBeUndefined()
    }
  })

  it('для вікон і хімчистки площу не зберігаємо', () => {
    const windows = validateCleaningMetadata({
      premise: 'apartment',
      service: 'windows',
      when: 'tomorrow',
      windowsCount: 4,
      windowSide: 'both',
      areaM2: 60,
    })
    expect(windows.ok).toBe(true)
    expect(windows.clean?.areaM2).toBeUndefined()
  })

  it('поправка — лише ±1, нуль і решта відкидаються', () => {
    expect(valid({ effortAdjust: 1 }).clean?.effortAdjust).toBe(1)
    expect(valid({ effortAdjust: -1 }).clean?.effortAdjust).toBe(-1)
    for (const bad of [0, 2, -3, '1', null]) {
      expect(valid({ effortAdjust: bad }).clean?.effortAdjust).toBeUndefined()
    }
    expect(parseEffortAdjust(undefined)).toBe(0)
  })
})
