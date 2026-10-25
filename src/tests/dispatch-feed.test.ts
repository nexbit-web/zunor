import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from './helpers/prisma-mock'
import { DISTRICTS } from '../../prisma/data/districts'
import type { Prisma } from '../generated/prisma/client'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('./helpers/prisma-mock')).prisma,
}))

const { masterFeedScope, reachableDistricts } =
  await import('$lib/server/dispatch/feed')
const { WAVES_DONE_MIN } = await import('$lib/server/dispatch/core/waves')
const { DISPATCH_CONFIG } = await import('$lib/server/dispatch/config')
const { JOB_LIFETIME_MS } = await import('$lib/server/job-lifetime')
const { cityDistricts } = await import('$lib/geo/districts')

// Правило видимості стрічки майстра (SSR і API беруть його звідси).
// Перевіряється поведінка — «бачить чи ні», — а не форма where: умови
// проганяються через мінімальний обчислювач нижче на справжніх заявках.

const ODESA = cityDistricts(DISTRICTS, 'odesa')
const NOW = new Date('2026-10-25T12:00:00Z')
const MIN = 60_000

interface FeedJob {
  id: string
  createdAt: Date
  district: string | null
}

/** Обчислює JobWhereInput на заявці — рівно ті оператори, що дає scope. */
function matches(job: FeedJob, where: Prisma.JobWhereInput): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') {
      return (cond as Prisma.JobWhereInput[]).every((w) => matches(job, w))
    }
    if (key === 'OR') {
      return (cond as Prisma.JobWhereInput[]).some((w) => matches(job, w))
    }
    const value = job[key as keyof FeedJob]
    if (cond === null) return value === null
    const c = cond as { in?: unknown[]; notIn?: unknown[]; lte?: Date }
    // SQL: NULL NOT IN (...) — не істина, тож null сюди не проходить.
    if (c.notIn && (value === null || c.notIn.includes(value))) return false
    if (c.in && !c.in.includes(value)) return false
    if (c.lte && !((value as Date) <= c.lte)) return false
    return true
  })
}

async function scopeFor(
  opts: { district?: string | null; radius?: number | null } = {},
) {
  return masterFeedScope({
    masterId: 'm1',
    masterDistrict: opts.district === undefined ? 'center' : opts.district,
    travelRadiusKm: opts.radius === undefined ? 5 : opts.radius,
    districts: ODESA,
    now: NOW,
  })
}

type Scope = Awaited<ReturnType<typeof scopeFor>>

const sees = (scope: Scope, job: FeedJob) =>
  !scope.declinedIds.includes(job.id) &&
  scope.where.every((w) => matches(job, w))

const job = (
  id: string,
  ageMin: number,
  district: string | null = 'center',
): FeedJob => ({
  id,
  createdAt: new Date(NOW.getTime() - ageMin * MIN),
  district,
})

const called = (...ids: string[]) =>
  prisma.dispatchEvent.findMany.mockResolvedValue(
    ids.map((jobId) => ({ jobId, declined: false })),
  )

beforeEach(() => {
  resetPrisma()
  prisma.dispatchEvent.findMany.mockResolvedValue([])
})

describe('стрічка не обганяє розсилку', () => {
  it('остання хвиля — «усе місто», і саме тоді заявка відкривається всім', () => {
    const last = DISPATCH_CONFIG.WAVES.at(-1)!
    expect(last.radiusKm).toBeNull()
    expect(WAVES_DONE_MIN).toBe(last.afterMinutes)
  })

  it('свіжу заявку непокликаний не бачить, навіть поруч', async () => {
    expect(sees(await scopeFor(), job('fresh', 1))).toBe(false)
  })

  it('покликаний бачить свіжу заявку одразу', async () => {
    called('fresh')
    expect(sees(await scopeFor(), job('fresh', 1))).toBe(true)
  })

  it('після останньої хвилі — бачать усі, кому в межах', async () => {
    const scope = await scopeFor()
    expect(sees(scope, job('edge', WAVES_DONE_MIN))).toBe(true)
    expect(sees(scope, job('just-before', WAVES_DONE_MIN - 0.01))).toBe(false)
  })
})

describe('межа виїзду', () => {
  it('після хвиль заявку з-за меж не показуємо', async () => {
    expect(sees(await scopeFor(), job('far', 60, 'kotovskoho'))).toBe(false)
  })

  // Остання хвиля кличе й тих, кому далеко, якщо майстрів мало. Сповіщення
  // без заявки в стрічці виглядало б як баг — покликаний бачить її завжди.
  it('покликаний бачить заявку з-за своєї межі', async () => {
    called('far')
    const scope = await scopeFor()
    expect(sees(scope, job('far', 1, 'kotovskoho'))).toBe(true)
    expect(sees(scope, job('far', 60, 'kotovskoho'))).toBe(true)
  })

  it('«будь-де» — бачить усе місто', async () => {
    const scope = await scopeFor({ radius: null })
    expect(sees(scope, job('far', 60, 'kotovskoho'))).toBe(true)
  })

  // Перевірити відстань нема чим — нічого не ховаємо, як і розсилка.
  it('заявка без району або з вимкненим районом — не ховаємо', async () => {
    const scope = await scopeFor()
    expect(sees(scope, job('no-district', 60, null))).toBe(true)
    expect(sees(scope, job('gone', 60, 'зниклий-район'))).toBe(true)
  })

  it('майстер без району — фільтра за відстанню немає', async () => {
    const scope = await scopeFor({ district: null })
    expect(sees(scope, job('far', 60, 'kotovskoho'))).toBe(true)
  })
})

describe('відмови і журнал', () => {
  it('відмова ховає заявку назавжди, навіть покликану', async () => {
    prisma.dispatchEvent.findMany.mockResolvedValue([
      { jobId: 'nope', declined: true },
    ])
    expect(sees(await scopeFor({ radius: null }), job('nope', 60))).toBe(false)
  })

  it('журнал: відмови — за весь час, покликання — за життя заявки, зі стелею', async () => {
    await scopeFor()

    const args = prisma.dispatchEvent.findMany.mock.calls[0][0]
    expect(args.where.masterId).toBe('m1')
    expect(args.where.OR).toContainEqual({ declined: true })
    expect(args.where.OR).toContainEqual({
      notifiedAt: { gte: new Date(NOW.getTime() - JOB_LIFETIME_MS) },
    })
    expect(args.take).toBeGreaterThan(0)
  })
})

describe('reachableDistricts — межа майстра', () => {
  it('свій район і сусіди — так, інший кінець міста — ні', () => {
    const reach = reachableDistricts(ODESA, 'center', 5)!
    expect(reach).toContain('center')
    expect(reach).toContain('moldavanka')
    expect(reach).not.toContain('kotovskoho')
    expect(reach).not.toContain('chornomorsk')
  })

  it('ширша межа — більше районів', () => {
    const narrow = reachableDistricts(ODESA, 'center', 5)!
    const wide = reachableDistricts(ODESA, 'center', 15)!
    expect(wide.length).toBeGreaterThan(narrow.length)
    for (const slug of narrow) expect(wide).toContain(slug)
  })

  it('без фільтра: «будь-де», район невідомий, місто без районів', () => {
    expect(reachableDistricts(ODESA, 'center', null)).toBeNull()
    expect(reachableDistricts(ODESA, null, 5)).toBeNull()
    expect(reachableDistricts(ODESA, 'nowhere', 5)).toBeNull()
    expect(reachableDistricts([], 'center', 5)).toBeNull()
  })
})
