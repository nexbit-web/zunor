import { describe, it, expect } from 'vitest'
import {
  jobFit,
  pickBestMatches,
  type FitInput,
} from '$lib/server/dispatch/core/fit'
import { DISPATCH_CONFIG } from '$lib/server/dispatch/config'

// «Топ для тебе» у стрічці майстра. Правило — «розсилка покликала б його
// першою хвилею й без штрафу»: поруч (перше кільце), формат роботи не
// проти обсягу, авто є, якщо треба вивезти. Тестуємо поведінку, а не
// числа: межі кільця й ваги формату можна крутити в config.ts.

const FIRST_RING = DISPATCH_CONFIG.WAVES[0].radiusKm ?? 0

const base: FitInput = {
  distanceKm: 0,
  hasVehicle: null,
  crew: null,
  effort: null,
  needsVehicle: false,
}

describe('jobFit', () => {
  it('заявка у своєму районі підходить', () => {
    const fit = jobFit(base)
    expect(fit.best).toBe(true)
    expect(fit.reasons).toContain('near')
  })

  it('далі першого кільця — ні', () => {
    expect(jobFit({ ...base, distanceKm: FIRST_RING + 2 }).best).toBe(false)
  })

  // Невідомо ≠ поруч: так само, як у розсилці.
  it('невідома відстань — не «поруч»', () => {
    expect(jobFit({ ...base, distanceKm: null }).best).toBe(false)
  })

  // Відстань у часі дороги: на авто за два райони — як сусід пішки.
  it('з авто дальня заявка стає близькою', () => {
    const far = { ...base, distanceKm: FIRST_RING * 1.5 }
    expect(jobFit(far).best).toBe(false)
    expect(jobFit({ ...far, hasVehicle: true }).best).toBe(true)
  })

  it('треба вивезти сміття, а авто явно немає — не підходить', () => {
    expect(
      jobFit({ ...base, needsVehicle: true, hasVehicle: false }).best,
    ).toBe(false)
  })

  it('авто є — це причина, яку видно в картці', () => {
    const fit = jobFit({ ...base, needsVehicle: true, hasVehicle: true })
    expect(fit.best).toBe(true)
    expect(fit.reasons).toContain('vehicle')
  })

  // «Не відповідав» — не «ні»: старий профіль не втрачає позначки.
  it('без відповіді про авто вивіз не відбирає позначку', () => {
    expect(jobFit({ ...base, needsVehicle: true }).best).toBe(true)
  })

  it('компанія на невелике прибирання — не «підходить»', () => {
    expect(jobFit({ ...base, crew: 'COMPANY', effort: 2 }).best).toBe(false)
  })

  it('бригада на дуже велике — підходить, і саме через формат', () => {
    const fit = jobFit({ ...base, crew: 'TEAM', effort: 10 })
    expect(fit.best).toBe(true)
    expect(fit.reasons).toContain('crew')
  })

  it('ближча заявка має вищий бал за дальшу', () => {
    expect(jobFit({ ...base, distanceKm: 0.5 }).score).toBeGreaterThan(
      jobFit({ ...base, distanceKm: 2.5 }).score,
    )
  })
})

describe('pickBestMatches', () => {
  const item = (id: string, input: Partial<FitInput>) => ({
    id,
    fit: jobFit({ ...base, ...input }),
  })

  // Позначка на кожній другій картці нічого б не казала.
  it('не більше ліміту на сторінку, найкращі за балом', () => {
    const items = [
      item('far-ish', { distanceKm: 2.5 }),
      item('a', { distanceKm: 0 }),
      item('b', { distanceKm: 0.5 }),
      item('c', { distanceKm: 1 }),
      item('d', { distanceKm: 1.5 }),
    ]
    const best = pickBestMatches(items)

    expect(best.size).toBe(DISPATCH_CONFIG.BEST_MATCH_LIMIT)
    expect(best.has('a')).toBe(true)
    expect(best.has('far-ish')).toBe(false)
  })

  it('непідхожі не потрапляють навіть коли місця є', () => {
    const best = pickBestMatches([
      item('near', { distanceKm: 0 }),
      item('far', { distanceKm: FIRST_RING + 5 }),
    ])

    expect([...best.keys()]).toEqual(['near'])
    expect(best.get('near')).toContain('near')
  })
})
