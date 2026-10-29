import { describe, it, expect } from 'vitest'
import {
  cleaningConditions,
  cleaningNeedsVehicle,
  parseCleaningSkills,
  validateCleaningSkills,
} from '$lib/categories/cleaning/skills'
import { matchingFor, meetsConditions } from '$lib/categories/matching'
import {
  CREW_OPTIONS,
  crewLabel,
  isCrew,
  parseMasterSkills,
} from '$lib/masters/meta'

// Анкета майстра → кому заявка підходить. Чиста частина: що вважається
// відповіддю, які з неї умови на заявку і коли заявці потрібне авто чи
// команда. Розсилку цілком тримає dispatch-engine.test.ts.

describe('уміння прибирання з форми', () => {
  it('приймає ключі з довідника в його порядку, без дублів', () => {
    const r = validateCleaningSkills({
      services: ['sofa', 'standard', 'sofa', 'hack'],
      premises: ['business', 'home', 'mars'],
    })
    expect(r).toEqual({
      ok: true,
      value: { services: ['standard', 'sofa'], premises: ['home', 'business'] },
    })
  })

  it('без виду прибирання чи обʼєкта — помилка з людським текстом', () => {
    for (const raw of [
      { services: [], premises: ['home'] },
      { services: ['deep'], premises: [] },
      undefined,
      'windows',
    ]) {
      const r = validateCleaningSkills(raw)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5)
    }
  })

  it('з бази: битий JSON — «не відповідав», а не падіння', () => {
    expect(parseCleaningSkills(null)).toBeNull()
    expect(parseCleaningSkills('x')).toBeNull()
    expect(parseCleaningSkills({ services: 'deep' })).toBeNull()
  })
})

describe('умови на заявку', () => {
  const skills = { services: ['windows'], premises: ['home' as const] }
  const fits = (meta: Record<string, unknown>) =>
    meetsConditions(meta, cleaningConditions(skills))

  it('вид прибирання й тип обʼєкта мають збігтися обидва', () => {
    expect(fits({ service: 'windows', premise: 'apartment' })).toBe(true)
    expect(fits({ service: 'windows', premise: 'office' })).toBe(false)
    expect(fits({ service: 'deep', premise: 'apartment' })).toBe(false)
  })

  // Заздалегідь не скажеш, житло це чи ні — не відсіюємо нікого.
  it('«інше» помешкання підходить і житлу, і офісам', () => {
    expect(fits({ service: 'windows', premise: 'other' })).toBe(true)
  })

  it('не відповідав — умов немає, підходить будь-що', () => {
    expect(cleaningConditions(null)).toEqual([])
    expect(meetsConditions({ service: 'deep' }, [])).toBe(true)
  })

  it('заявка без metadata не проходить умов майстра з анкетою', () => {
    expect(meetsConditions(null, cleaningConditions(skills))).toBe(false)
  })
})

describe('що потрібно заявці', () => {
  it('авто — лише коли сміття треба вивезти', () => {
    expect(cleaningNeedsVehicle({ trash: 'needs-removal' })).toBe(true)
    expect(cleaningNeedsVehicle({ trash: 'removed' })).toBe(false)
    expect(cleaningNeedsVehicle(null)).toBe(false)
  })
})

describe('реєстр категорій', () => {
  it('категорія без правил підходить усім і нічого не питає', () => {
    const open = matchingFor('unknown-category')
    expect(open.conditions({ services: ['x'] })).toEqual([])
    expect(open.needsVehicle({ trash: 'needs-removal' })).toBe(false)
    expect(open.validateSkills({})).toBeNull()
    // Без обсягу формат роботи майстра на підбір не впливає.
    expect(open.effort({ premise: 'house' })).toBeNull()
  })

  it('прибирання бере свої правила', () => {
    const cleaning = matchingFor('prybyrannya')
    expect(
      cleaning.conditions({ services: ['sofa'], premises: ['home'] }),
    ).not.toEqual([])
    expect(cleaning.needsVehicle({ trash: 'needs-removal' })).toBe(true)
    expect(cleaning.effort({ premise: 'apartment', service: 'deep' })).toEqual(
      expect.any(Number),
    )
  })
})

describe('відповіді майстра', () => {
  it('уміння з metadata читаються як є', () => {
    expect(parseMasterSkills({ skills: { a: 1 } })).toEqual({ a: 1 })
  })

  // Битий JSON — «не відповідав»: підбір поводиться, як до анкети.
  it('порожньо чи биті поля — порожні вміння, а не падіння', () => {
    expect(parseMasterSkills(null)).toEqual({})
    expect(parseMasterSkills({ skills: [] })).toEqual({})
    expect(parseMasterSkills('рядок')).toEqual({})
  })

  it('формат роботи — лише з довідника (як enum CrewType у базі)', () => {
    for (const crew of ['SOLO', 'TEAM', 'COMPANY'])
      expect(isCrew(crew)).toBe(true)
    for (const bad of ['solo', 'ARMY', true, null, undefined]) {
      expect(isCrew(bad)).toBe(false)
    }
    // Кожен варіант форми має підпис — інакше крок перевірки показав би пусто.
    expect(CREW_OPTIONS.map((o) => o.value)).toEqual([
      'SOLO',
      'TEAM',
      'COMPANY',
    ])
    expect(crewLabel('COMPANY')).toBe('Клінінгова компанія')
    expect(crewLabel(null)).toBe('')
  })
})
