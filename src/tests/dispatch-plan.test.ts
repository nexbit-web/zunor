import { describe, it, expect } from 'vitest'
import { planWave, stopReason } from '$lib/server/dispatch/core/plan'
import { FINAL_WAVE, waveStartsAt } from '$lib/server/dispatch/core/waves'
import { DISPATCH_CONFIG } from '$lib/server/dispatch/config'
import type { Candidate, JobSnapshot } from '$lib/server/dispatch/types'

// Рішення хвилі — чиста функція, тож краї правила «останнього дзвінка»
// перевіряються тут без жодного моку бази. Інтеграцію (хто реально
// доходить із БД) тримає dispatch-engine.test.ts.

const { WAVES, LAST_CALL_MIN_REACH, MIN_RING_CANDIDATES } = DISPATCH_CONFIG
const CREATED = new Date('2026-10-25T12:00:00Z')

/** Момент, коли настає хвиля `wave`, плюс секунда. */
const during = (wave: number) =>
  new Date(waveStartsAt(CREATED, wave).getTime() + 1000)

function snapshot(patch: Partial<JobSnapshot> = {}): JobSnapshot {
  return {
    id: 'job-1',
    title: 'Прибирання',
    category: 'cleaning',
    city: 'odesa',
    district: 'center',
    clientId: 'client-1',
    status: 'OPEN',
    proposalsCount: 0,
    createdAt: CREATED,
    dispatchWave: 0,
    notified: new Set(),
    ...patch,
  }
}

function master(
  id: string,
  distanceKm: number | null,
  withinReach = true,
): Candidate {
  return {
    id,
    lastSeen: CREATED,
    avgRating: 4.5,
    isVerified: true,
    activeOrders: 0,
    masterSince: new Date(0),
    completedOrders: 50,
    responseRate: 0.5,
    recentNotifications: 0,
    distanceKm,
    withinReach,
  }
}

const ids = (plan: { toNotify: readonly { id: string }[] }) =>
  plan.toNotify.map((c) => c.id).sort()

describe('останній дзвінок: коли майстрів мало, відстань не перешкода', () => {
  it('єдиний майстер міста, якому задалеко, — отримує заявку в останній хвилі', () => {
    const plan = planWave(
      snapshot(),
      [master('far', 30, false)],
      during(FINAL_WAVE),
    )

    expect(plan.lastCall).toBe(true)
    expect(ids(plan)).toEqual(['far'])
  })

  it('до останньої хвилі межу майстра не переступаємо', () => {
    for (let wave = 1; wave < FINAL_WAVE; wave++) {
      const plan = planWave(
        snapshot(),
        [master('far', 30, false)],
        during(wave),
      )
      expect(plan.lastCall).toBe(false)
      expect(plan.toNotify).toEqual([])
    }
  })

  it('майстрів у межах досить — дальнього не турбуємо', () => {
    const near = Array.from({ length: LAST_CALL_MIN_REACH }, (_, i) =>
      master(`near${i}`, 1),
    )
    const plan = planWave(
      snapshot(),
      [...near, master('far', 30, false)],
      during(FINAL_WAVE),
    )

    expect(plan.lastCall).toBe(false)
    expect(ids(plan)).not.toContain('far')
  })

  // Охоплення — це всі, хто вже бачив заявку, а не лише нинішня хвиля.
  it('покликані раніше рахуються в охоплення', () => {
    const earlier = new Set(
      Array.from({ length: LAST_CALL_MIN_REACH }, (_, i) => `old${i}`),
    )
    const plan = planWave(
      snapshot({ notified: earlier }),
      [master('far', 30, false)],
      during(FINAL_WAVE),
    )

    expect(plan.lastCall).toBe(false)
    expect(plan.toNotify).toEqual([])
  })

  it('на одного менше порога — уже останній дзвінок', () => {
    const near = Array.from({ length: LAST_CALL_MIN_REACH - 1 }, (_, i) =>
      master(`near${i}`, 1),
    )
    const plan = planWave(
      snapshot(),
      [...near, master('far', 30, false)],
      during(FINAL_WAVE),
    )

    expect(plan.lastCall).toBe(true)
    expect(ids(plan)).toContain('far')
    for (const m of near) expect(ids(plan)).toContain(m.id)
  })

  it('нікого за межами немає — це не останній дзвінок', () => {
    const plan = planWave(snapshot(), [master('a', 1)], during(FINAL_WAVE))
    expect(plan.lastCall).toBe(false)
    expect(ids(plan)).toEqual(['a'])
  })

  // З-за меж — пропозиція, а не «нова заявка»: позначка їде далі, у текст
  // сповіщення й у журнал (там вона виключає мовчання з відзивчивості).
  it('позначка «з-за меж» — лише в тих, кому далеко', () => {
    const plan = planWave(
      snapshot(),
      [master('near', 1), master('far', 30, false)],
      during(FINAL_WAVE),
    )
    const byId = Object.fromEntries(plan.toNotify.map((c) => [c.id, c]))
    expect(byId.far.beyondReach).toBe(true)
    expect(byId.near.beyondReach).toBe(false)
  })

  // Ближчий іде першим і в останньому дзвінку: дальній — запасний варіант.
  it('у останньому дзвінку ближчий вище за дальнього', () => {
    const plan = planWave(
      snapshot(),
      [master('far', 30, false), master('near', 1)],
      during(FINAL_WAVE),
    )
    expect(plan.toNotify.map((c) => c.id)).toEqual(['near', 'far'])
  })
})

describe('квоти й кільця', () => {
  it('нема кандидатів — хвиля відпрацьована, кликати нікого', () => {
    const plan = planWave(snapshot(), [], during(1))
    expect(plan).toMatchObject({ kind: 'wave', wave: 1, toNotify: [] })
  })

  it('перша хвиля — не більше свого batchSize', () => {
    const many = Array.from({ length: 100 }, (_, i) => master(`m${i}`, 0))
    expect(planWave(snapshot(), many, during(1)).toNotify).toHaveLength(
      WAVES[0].batchSize,
    )
  })

  it('квота накопичувальна: покликані раніше займають місця', () => {
    const notified = new Set(
      Array.from({ length: WAVES[0].batchSize }, (_, i) => `old${i}`),
    )
    const many = Array.from({ length: 100 }, (_, i) => master(`m${i}`, 0))
    const plan = planWave(snapshot({ notified }), many, during(2))

    expect(plan.wave).toBe(2)
    expect(plan.toNotify).toHaveLength(WAVES[1].batchSize)
  })

  it('перша хвиля кличе лише перше кільце, якщо там досить людей', () => {
    const near = Array.from({ length: MIN_RING_CANDIDATES }, (_, i) =>
      master(`near${i}`, 0),
    )
    const plan = planWave(snapshot(), [...near, master('mid', 8)], during(1))

    expect(plan.radiusKm).toBe(WAVES[0].radiusKm)
    expect(ids(plan)).not.toContain('mid')
  })

  it('заявка без району — кілець немає', () => {
    const plan = planWave(
      snapshot({ district: null }),
      [master('a', null), master('b', null)],
      during(1),
    )
    expect(plan.radiusKm).toBeNull()
    expect(ids(plan)).toEqual(['a', 'b'])
  })

  it('назва заявки їде в рішення — з неї пишеться сповіщення', () => {
    const plan = planWave(
      snapshot({ title: 'Вікна' }),
      [master('a', 0)],
      during(1),
    )
    expect(plan.jobTitle).toBe('Вікна')
  })
})

describe('stopReason', () => {
  it('закрита заявка — job-closed, досить відгуків — enough-proposals', () => {
    for (const status of [
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      'EXPIRED',
    ] as const) {
      expect(stopReason({ status, proposalsCount: 0 })).toBe('job-closed')
    }
    expect(
      stopReason({
        status: 'OPEN',
        proposalsCount: DISPATCH_CONFIG.ENOUGH_PROPOSALS,
      }),
    ).toBe('enough-proposals')
    expect(
      stopReason({
        status: 'OPEN',
        proposalsCount: DISPATCH_CONFIG.ENOUGH_PROPOSALS - 1,
      }),
    ).toBeNull()
  })
})
