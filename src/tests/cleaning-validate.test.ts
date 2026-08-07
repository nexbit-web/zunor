import { describe, it, expect } from 'vitest'
import { validateCleaningMetadata } from '$lib/categories/cleaning/validate'

// Це остання лінія перед БД: сюди приходить і вивід LLM, і тіло POST від
// клієнта. Тести тримають дві обіцянки — обовʼязкові поля не проскакують,
// а все зайве відсікається (whitelist, а не merge вхідного обʼєкта).

/** Мінімум БЕЗ кімнат — для 'standard' цього замало, і це навмисно. */
const base = { premise: 'apartment', service: 'standard', when: 'today' }
/** Повністю валідна заявка — база для перевірки одного поля за раз. */
const valid = { ...base, rooms: '2' }

describe('вхід-сміття', () => {
  for (const bad of [null, undefined, 'string', 42, []] as unknown[]) {
    it(`${JSON.stringify(bad) ?? 'undefined'} → помилка`, () => {
      expect(validateCleaningMetadata(bad).ok).toBe(false)
    })
  }

  it('порожній обʼєкт → помилка про помешкання', () => {
    const r = validateCleaningMetadata({})
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })

  it('невідома послуга не приймається', () => {
    expect(
      validateCleaningMetadata({ ...base, service: 'teleportation' }).ok,
    ).toBe(false)
  })
})

describe('дата (when)', () => {
  it('приймає today і tomorrow', () => {
    expect(validateCleaningMetadata({ ...valid, when: 'today' }).ok).toBe(true)
    expect(validateCleaningMetadata({ ...valid, when: 'tomorrow' }).ok).toBe(
      true,
    )
  })

  it('приймає майбутню ISO-дату', () => {
    const future = new Date(Date.now() + 7 * 24 * 3600_000)
      .toISOString()
      .slice(0, 10)
    expect(validateCleaningMetadata({ ...valid, when: future }).ok).toBe(true)
  })

  it('відхиляє минуле — заявку в минуле не створюють', () => {
    const r = validateCleaningMetadata({ ...valid, when: '2020-01-01' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('дату')
  })

  it('відхиляє кривий формат', () => {
    for (const bad of ['05.08.2026', 'завтра', '2026-8-5', '']) {
      const r = validateCleaningMetadata({ ...valid, when: bad })
      expect(r.ok).toBe(false)
      expect(r.error).toContain('дату')
    }
  })
})

describe('житлові послуги', () => {
  it('вимагають кількість кімнат', () => {
    expect(validateCleaningMetadata(base).ok).toBe(false)
    expect(validateCleaningMetadata({ ...base, rooms: '2' }).ok).toBe(true)
  })

  it('поверх поза діапазоном мовчки відкидається, а не валить заявку', () => {
    const r = validateCleaningMetadata({ ...base, rooms: '2', floor: 999 })
    expect(r.ok).toBe(true)
    expect(r.clean?.floor).toBeUndefined()
  })

  it('коректний поверх зберігається', () => {
    const r = validateCleaningMetadata({ ...base, rooms: '2', floor: 5 })
    expect(r.clean?.floor).toBe(5)
  })
})

describe('балкон — бізнес-правило deep + apartment', () => {
  it('зберігається для генерального прибирання квартири', () => {
    const r = validateCleaningMetadata({
      premise: 'apartment',
      service: 'deep',
      when: 'today',
      rooms: '2',
      balcony: 'standard',
    })
    expect(r.clean?.balcony).toBe('standard')
  })

  it('мовчки відкидається для будинку', () => {
    const r = validateCleaningMetadata({
      premise: 'house',
      service: 'deep',
      when: 'today',
      rooms: '2',
      balcony: 'standard',
    })
    expect(r.ok).toBe(true)
    expect(r.clean?.balcony).toBeUndefined()
  })

  it('мовчки відкидається для звичайного прибирання квартири', () => {
    const r = validateCleaningMetadata({
      ...base,
      rooms: '2',
      balcony: 'standard',
    })
    expect(r.clean?.balcony).toBeUndefined()
  })
})

describe('миття вікон', () => {
  const windows = { premise: 'apartment', service: 'windows', when: 'today' }

  it('вимагає кількість вікон', () => {
    expect(
      validateCleaningMetadata({ ...windows, windowSide: 'inside' }).ok,
    ).toBe(false)
  })

  it('вимагає сторону миття — вона найсильніше впливає на ціну', () => {
    // Регресія: раніше відповідь клієнта губилась у вільному тексті опису.
    const r = validateCleaningMetadata({ ...windows, windowsCount: 5 })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('боку')
  })

  it('приймає повний набір', () => {
    const r = validateCleaningMetadata({
      ...windows,
      windowsCount: 5,
      windowSide: 'outside',
    })
    expect(r.ok).toBe(true)
    expect(r.clean?.windowsCount).toBe(5)
    expect(r.clean?.windowSide).toBe('outside')
  })

  it('відхиляє кількість поза межами 1..200', () => {
    for (const n of [0, -3, 201, 1.5]) {
      expect(
        validateCleaningMetadata({
          ...windows,
          windowsCount: n,
          windowSide: 'inside',
        }).ok,
      ).toBe(false)
    }
  })

  it('не питає кімнати у вікон', () => {
    const r = validateCleaningMetadata({
      ...windows,
      windowsCount: 3,
      windowSide: 'both',
    })
    expect(r.ok).toBe(true)
    expect(r.clean?.rooms).toBeUndefined()
  })
})

describe('після ремонту і регулярне', () => {
  it('після ремонту вимагає поле про сміття', () => {
    const withoutTrash = {
      premise: 'apartment',
      service: 'post-renovation',
      when: 'today',
      rooms: '2',
    }
    expect(validateCleaningMetadata(withoutTrash).ok).toBe(false)
    expect(
      validateCleaningMetadata({ ...withoutTrash, trash: 'needs-removal' }).ok,
    ).toBe(true)
  })

  it('регулярне вимагає частоту', () => {
    const withoutFreq = {
      premise: 'apartment',
      service: 'regular',
      when: 'today',
      rooms: '2',
    }
    expect(validateCleaningMetadata(withoutFreq).ok).toBe(false)
    expect(
      validateCleaningMetadata({ ...withoutFreq, frequency: 'weekly' }).ok,
    ).toBe(true)
  })
})

describe('хімчистка', () => {
  const sofa = { premise: 'apartment', service: 'sofa', when: 'today' }

  it('вимагає хоча б один валідний предмет', () => {
    expect(validateCleaningMetadata({ ...sofa, items: [] }).ok).toBe(false)
    expect(validateCleaningMetadata(sofa).ok).toBe(false)
  })

  it('відсіює невалідні предмети, але лишає валідні', () => {
    const r = validateCleaningMetadata({
      ...sofa,
      items: [
        { type: 'sofa', qty: 1 },
        { type: 'spaceship', qty: 2 },
        { type: 'sofa', qty: 0 },
        null,
        'сміття',
      ],
    })
    expect(r.ok).toBe(true)
    expect(r.clean?.items).toHaveLength(1)
  })

  it('падає, якщо валідних предметів не лишилось', () => {
    const r = validateCleaningMetadata({
      ...sofa,
      items: [{ type: 'spaceship', qty: 2 }],
    })
    expect(r.ok).toBe(false)
  })

  it('невідомий варіант відкидається, предмет лишається', () => {
    const r = validateCleaningMetadata({
      ...sofa,
      items: [{ type: 'sofa', qty: 1, variant: 'величезний' }],
    })
    expect(r.clean?.items?.[0].variant).toBeUndefined()
    expect(r.clean?.items?.[0].qty).toBe(1)
  })
})

describe('whitelist: у clean потрапляє лише відоме', () => {
  it('сторонні ключі не проходять у metadata', () => {
    const r = validateCleaningMetadata({
      ...base,
      rooms: '2',
      isAdmin: true,
      priceCents: 1,
      __proto__: { polluted: true },
    })
    expect(r.ok).toBe(true)
    expect(r.clean).toEqual({
      premise: 'apartment',
      service: 'standard',
      when: 'today',
      rooms: '2',
    })
  })
})
