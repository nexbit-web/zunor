import { describe, it, expect } from 'vitest'
import { resolveWhen } from '$lib/categories/cleaning/presets'
import { describeJob } from '$lib/categories/cleaning/describe'

// «today»/«tomorrow» лежать у metadata як є — відносно дня СТВОРЕННЯ
// заявки. Поки їх показували без цієї дати, заявка «на завтра» тижневої
// давності цілий тиждень висіла в списку як «Завтра».

describe('день прибирання з metadata.when', () => {
  it('ISO-дата лишається як є', () => {
    expect(resolveWhen('2026-03-20', '2026-03-10T10:00:00Z')).toBe('2026-03-20')
  })

  it('«tomorrow» — наступний день після створення, а не після сьогодні', () => {
    expect(resolveWhen('tomorrow', '2026-03-10T10:00:00Z')).toBe('2026-03-11')
    expect(resolveWhen('today', '2026-03-10T10:00:00Z')).toBe('2026-03-10')
  })

  // 23:30 UTC — це вже 01:30 наступного дня за Києвом.
  it('день створення — за Києвом', () => {
    expect(resolveWhen('today', '2026-03-10T23:30:00Z')).toBe('2026-03-11')
  })

  it('сміття замість дати — null, а не «Invalid Date»', () => {
    expect(resolveWhen('колись', '2026-03-10T10:00:00Z')).toBeNull()
    expect(resolveWhen(undefined, '2026-03-10T10:00:00Z')).toBeNull()
    expect(resolveWhen('tomorrow', 'не дата')).toBeNull()
  })
})

describe('describeJob і дата створення', () => {
  const when = (details: ReturnType<typeof describeJob>) =>
    details.find((d) => d.label === 'Коли')?.value

  it('зі створенням — справжня дата', () => {
    expect(
      when(describeJob({ when: 'tomorrow' }, '2026-03-10T10:00:00Z')),
    ).toBe('11 березня')
  })

  // Драфт у чаті ще не створений: там «Завтра» — правда.
  it('без дати створення — «Завтра» як є', () => {
    expect(when(describeJob({ when: 'tomorrow' }))).toBe('Завтра')
  })
})
