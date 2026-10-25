import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from './helpers/prisma-mock'
import { safeTrigger, resetInfra } from './helpers/infra'
import { DISPATCH_CONFIG } from '$lib/server/dispatch/config'
import { FINAL_WAVE } from '$lib/server/dispatch/core/waves'
import type { DispatchDecision, WavePlan } from '$lib/server/dispatch/types'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('./helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/reference', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/reference')>()),
  getDistricts: (await import('./helpers/districts')).getDistricts,
}))
vi.mock('$lib/server/pusher', async () => await import('./helpers/infra'))

const { decide } = await import('$lib/server/dispatch/decide')
const { dispatchJob } = await import('$lib/server/dispatch/dispatch')
const { markOpened, markResponded } = await import('$lib/server/dispatch')

// Мозок підбору цілком: що він читає з бази, що вирішує і що пише. Чисті
// правила (кільця, бал, останній дзвінок) мають власні тести; тут —
// стики з базою, які легко зламати непомітно:
//
//   1. зупинки працюють і не будять базу даремно;
//   2. нікого не кличемо двічі;
//   3. хвиля рахується з віку заявки, а відпрацьована — пишеться в заявку;
//   4. покликаний, його сповіщення й номер хвилі — одна транзакція під
//      локом; подія Pusher — лише після коміту;
//   5. межа майстра тримається, доки майстрів досить.

const JOB = 'job-1'
const CLIENT = 'client-1'
const MIN = 60_000

function job(patch: Record<string, unknown> = {}) {
  return {
    id: JOB,
    title: 'Прибирання',
    category: 'cleaning',
    city: 'odesa',
    district: null,
    clientId: CLIENT,
    status: 'OPEN',
    proposalsCount: 0,
    createdAt: new Date(),
    dispatchWave: 0,
    ...patch,
  }
}

const aged = (minutes: number, patch: Record<string, unknown> = {}) =>
  job({ createdAt: new Date(Date.now() - minutes * MIN), ...patch })

/** Майстер у вигляді, який повертає findMany у loadCandidates. */
function master(
  id: string,
  district: string | null = null,
  travelRadiusKm: number | null = null,
) {
  return {
    id,
    lastSeen: new Date(Date.now() - MIN),
    avgRatingAsMaster: 4.5,
    district,
    masterProfile: {
      verificationStatus: 'VERIFIED',
      completedOrders: 30,
      createdAt: new Date(Date.now() - 400 * 86_400_000),
      travelRadiusKm,
    },
  }
}

function wave(d: DispatchDecision): WavePlan {
  if (d.kind !== 'wave') throw new Error(`очікували хвилю, а не ${d.reason}`)
  return d
}

const ids = (d: DispatchDecision) =>
  wave(d)
    .toNotify.map((c) => c.id)
    .sort()

beforeEach(() => {
  resetPrisma()
  resetInfra()
  prisma.job.findUnique.mockResolvedValue(job())
  prisma.dispatchEvent.findMany.mockResolvedValue([])
  prisma.user.findMany.mockResolvedValue([])
  prisma.order.groupBy.mockResolvedValue([])
  prisma.dispatchEvent.groupBy.mockResolvedValue([])
  prisma.notification.createManyAndReturn.mockImplementation(
    async ({ data }: { data: Record<string, unknown>[] }) =>
      data.map((row, i) => ({ id: `ntf-${i}`, ...row })),
  )
})

describe('зупинки', () => {
  it('заявки немає — job-closed, до кандидатів не доходимо', async () => {
    prisma.job.findUnique.mockResolvedValue(null)

    expect(await decide(JOB)).toEqual({ kind: 'stop', reason: 'job-closed' })
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })

  it('заявка вже не OPEN — job-closed', async () => {
    for (const status of ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED']) {
      prisma.job.findUnique.mockResolvedValue(job({ status }))
      expect(await decide(JOB)).toEqual({ kind: 'stop', reason: 'job-closed' })
    }
  })

  it('досить відгуків — enough-proposals, без запиту майстрів', async () => {
    prisma.job.findUnique.mockResolvedValue(
      job({ proposalsCount: DISPATCH_CONFIG.ENOUGH_PROPOSALS }),
    )

    expect(await decide(JOB)).toEqual({
      kind: 'stop',
      reason: 'enough-proposals',
    })
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })

  // Порожня хвиля — не зупинка: майстри можуть зареєструватись до наступної.
  it('нема кого кликати — хвиля відпрацьована порожньою', async () => {
    const d = wave(await decide(JOB))
    expect(d.toNotify).toEqual([])
    expect(d.wave).toBe(1)
  })
})

describe('кого беремо в кандидати', () => {
  it('активний майстер свого міста й послуги, крім самого клієнта', async () => {
    prisma.user.findMany.mockResolvedValue([master('m1')])
    await decide(JOB)

    const args = prisma.user.findMany.mock.calls[0][0]
    expect(args.where.role).toBe('MASTER')
    expect(args.where.city).toBe('odesa')
    expect(args.where.id).toEqual({ not: CLIENT })
    expect(args.where.masterProfile).toEqual({
      isActive: true,
      categories: { has: 'cleaning' },
    })
  })

  // Пул тягнеться в памʼять процесу — без стелі одна заявка у великому
  // місті витягла б усіх майстрів разом з агрегатами.
  it('пул має стелю і бере спершу свіжих', async () => {
    prisma.user.findMany.mockResolvedValue([master('m1')])
    await decide(JOB)

    const args = prisma.user.findMany.mock.calls[0][0]
    expect(args.take).toBe(500)
    expect(args.orderBy).toEqual({ lastSeen: 'desc' })
  })

  it('уже покликані не потрапляють у вибірку', async () => {
    prisma.dispatchEvent.findMany.mockResolvedValue([
      { masterId: 'm1' },
      { masterId: 'm2' },
    ])
    prisma.user.findMany.mockResolvedValue([
      master('m1'),
      master('m2'),
      master('m3'),
    ])

    expect(ids(await decide(JOB))).toEqual(['m3'])
  })

  it('майстер без профілю відсіюється, а не падає', async () => {
    prisma.user.findMany.mockResolvedValue([
      { ...master('m1'), masterProfile: null },
    ])
    expect(wave(await decide(JOB)).toNotify).toEqual([])
  })

  // Хвиля — це кілька запитів на ВЕСЬ пул, а не по запиту на майстра.
  it('агрегати беруться пакетом: зайнятість і два запити журналу', async () => {
    prisma.user.findMany.mockResolvedValue([
      master('m1'),
      master('m2'),
      master('m3'),
    ])
    await decide(JOB)

    expect(prisma.order.groupBy).toHaveBeenCalledTimes(1)
    expect(prisma.dispatchEvent.groupBy).toHaveBeenCalledTimes(2)
    expect(
      prisma.order.groupBy.mock.calls[0][0].where.masterId.in,
    ).toHaveLength(3)
  })

  it('відзивчивість рахується з одного groupBy: усі й ті, хто відгукнувся', async () => {
    prisma.user.findMany.mockResolvedValue([master('m1')])
    await decide(JOB)

    const counts = prisma.dispatchEvent.groupBy.mock.calls.map(
      (c: [{ _count: Record<string, boolean> }]) => c[0]._count,
    )
    expect(counts).toContainEqual({ _all: true, respondedAt: true })
  })
})

describe('хвиля — з віку заявки', () => {
  const cases: [string, number, number][] = [
    ['щойно створена', 0, 1],
    ['через хвилину — ще перша', 1, 1],
    ['через 2 хвилини — друга', 2, 2],
    ['через 5 хвилин — третя', 5, 3],
    ['через 10 хвилин — остання', 10, FINAL_WAVE],
    ['через добу — остання', 1440, FINAL_WAVE],
  ]

  for (const [label, ageMin, expected] of cases) {
    it(label, async () => {
      prisma.job.findUnique.mockResolvedValue(aged(ageMin))
      prisma.user.findMany.mockResolvedValue([master('m1')])

      expect(wave(await decide(JOB)).wave).toBe(expected)
    })
  }

  it('остання хвиля забирає весь пул', async () => {
    prisma.job.findUnique.mockResolvedValue(aged(20))
    prisma.user.findMany.mockResolvedValue(
      Array.from({ length: 120 }, (_, i) => master(`m${i}`)),
    )
    expect(wave(await decide(JOB)).toNotify).toHaveLength(120)
  })
})

describe('кільця й межа майстра на справжніх районах', () => {
  // Відстані — з даних сіду (prisma/data/districts.ts): Центр → Малий
  // Фонтан ближче, ніж Центр → Селище Котовського (~10+ км).
  const NEAR = 'center'
  const FAR = 'kotovskoho'
  const RING = DISPATCH_CONFIG.MIN_RING_CANDIDATES

  const nearby = () =>
    Array.from({ length: RING }, (_, i) => master(`near${i}`, NEAR))

  it('у вибірку йдуть район майстра і його межа виїзду', async () => {
    prisma.job.findUnique.mockResolvedValue(job({ district: NEAR }))
    prisma.user.findMany.mockResolvedValue(nearby())
    await decide(JOB)

    const select = prisma.user.findMany.mock.calls[0][0].select
    expect(select.district).toBe(true)
    expect(select.masterProfile.select.travelRadiusKm).toBe(true)
  })

  it('перша хвиля кличе найближчих', async () => {
    prisma.job.findUnique.mockResolvedValue(job({ district: NEAR }))
    prisma.user.findMany.mockResolvedValue([...nearby(), master('far', FAR)])

    const d = wave(await decide(JOB))
    expect(d.radiusKm).toBe(DISPATCH_CONFIG.WAVES[0].radiusKm)
    expect(ids(d)).not.toContain('far')
  })

  it('«до 5 км» тримається, доки в межах вистачає майстрів', async () => {
    prisma.job.findUnique.mockResolvedValue(aged(20, { district: NEAR }))
    prisma.user.findMany.mockResolvedValue([
      ...nearby(),
      master('picky', FAR, 5),
    ])

    const d = wave(await decide(JOB))
    expect(d.lastCall).toBe(false)
    expect(ids(d)).not.toContain('picky')
  })

  // Той самий баг із життя: один майстер на місто з межею 5 км, заявка за
  // 10+ км — і вона не приходила йому ніколи.
  it('майстрів мало — остання хвиля доходить і до того, кому далеко', async () => {
    prisma.job.findUnique.mockResolvedValue(aged(20, { district: NEAR }))
    prisma.user.findMany.mockResolvedValue([master('picky', FAR, 5)])

    const d = wave(await decide(JOB))
    expect(d.lastCall).toBe(true)
    expect(ids(d)).toEqual(['picky'])
  })

  it('до останньої хвилі — не доходить, хай би як мало було майстрів', async () => {
    prisma.job.findUnique.mockResolvedValue(aged(6, { district: NEAR }))
    prisma.user.findMany.mockResolvedValue([master('picky', FAR, 5)])

    expect(wave(await decide(JOB)).toNotify).toEqual([])
  })

  it('майстер без району чекає останнього кільця', async () => {
    prisma.job.findUnique.mockResolvedValue(job({ district: NEAR }))
    prisma.user.findMany.mockResolvedValue([...nearby(), master('unknown')])
    expect(ids(await decide(JOB))).not.toContain('unknown')

    prisma.job.findUnique.mockResolvedValue(aged(20, { district: NEAR }))
    expect(ids(await decide(JOB))).toContain('unknown')
  })

  it('район, якого вже немає в довіднику, — те саме, що без району', async () => {
    prisma.job.findUnique.mockResolvedValue(job({ district: 'зник' }))
    prisma.user.findMany.mockResolvedValue([
      master('a', NEAR),
      master('b', FAR),
    ])

    const d = wave(await decide(JOB))
    expect(d.radiusKm).toBeNull()
    expect(ids(d)).toEqual(['a', 'b'])
  })
})

describe('dispatchJob: одна транзакція, події після коміту', () => {
  beforeEach(() => {
    prisma.user.findMany.mockResolvedValue([master('m1'), master('m2')])
  })

  it('advisory-лок і запас часу на прокидання Neon', async () => {
    await dispatchJob(JOB)

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
    const options = prisma.$transaction.mock.calls[0][1]
    expect(options.maxWait).toBeGreaterThan(2000)
    expect(options.timeout).toBeGreaterThan(5000)
  })

  it('журнал, сповіщення й номер хвилі пишуться в транзакції, подія — після', async () => {
    const order: string[] = []
    prisma.dispatchEvent.createMany.mockImplementation(async () => {
      order.push('journal')
    })
    prisma.notification.createManyAndReturn.mockImplementation(
      async ({ data }: { data: Record<string, unknown>[] }) => {
        order.push('notices')
        return data.map((row, i) => ({ id: `ntf-${i}`, ...row }))
      },
    )
    prisma.job.updateMany.mockImplementation(async () => {
      order.push('progress')
    })
    const tx = prisma.$transaction.getMockImplementation()
    prisma.$transaction.mockImplementation(
      async (fn: unknown, opts: unknown) => {
        const result = await tx(fn, opts)
        order.push('commit')
        return result
      },
    )
    safeTrigger.mockImplementation(async () => {
      order.push('push')
    })

    await dispatchJob(JOB)

    expect(order).toEqual([
      'journal',
      'notices',
      'progress',
      'commit',
      'push',
      'push',
    ])
  })

  it('сповіщення — «нова заявка» з назвою, кожному покликаному', async () => {
    await dispatchJob(JOB)

    const rows = prisma.notification.createManyAndReturn.mock.calls[0][0].data
    expect(rows).toEqual([
      expect.objectContaining({ userId: 'm1', type: 'NEW_JOB', jobId: JOB }),
      expect.objectContaining({ userId: 'm2', type: 'NEW_JOB', jobId: JOB }),
    ])
    for (const row of rows) expect(row.body).toBe('Прибирання')
  })

  it('подія — в особистий канал майстра, імʼя події літералом', async () => {
    await dispatchJob(JOB)

    expect(safeTrigger).toHaveBeenCalledWith(
      'private-user-m1',
      'notification:new',
      expect.objectContaining({
        notification: expect.objectContaining({ userId: 'm1' }),
      }),
    )
  })

  it('журнал без дублів і з відстанню', async () => {
    await dispatchJob(JOB)

    const created = prisma.dispatchEvent.createMany.mock.calls[0][0]
    expect(created.skipDuplicates).toBe(true)
    expect(created.data[0]).toMatchObject({ jobId: JOB, wave: 1 })
    expect(created.data[0]).toHaveProperty('distanceKm')
  })

  it('номер хвилі в заявці лише росте', async () => {
    await dispatchJob(JOB)

    expect(prisma.job.updateMany).toHaveBeenCalledWith({
      where: { id: JOB, dispatchWave: { lt: 1 } },
      data: { dispatchWave: 1 },
    })
  })

  // Інакше відновлення вважало б порожню хвилю непройденою й кликало б
  // її знову після кожного рестарту.
  it('порожня хвиля теж записується як відпрацьована', async () => {
    prisma.user.findMany.mockResolvedValue([])

    const res = await dispatchJob(JOB)
    expect(res).toEqual({ kind: 'wave', wave: 1, notified: 0, lastCall: false })
    expect(prisma.notification.createManyAndReturn).not.toHaveBeenCalled()
    expect(prisma.job.updateMany).toHaveBeenCalledTimes(1)
  })

  // Сповіщення вже в базі — збій Pusher лише відкладає дзвіночок.
  it('збій події не валить розсилку і не губить решту', async () => {
    safeTrigger.mockRejectedValueOnce(new Error('pusher down'))

    const res = await dispatchJob(JOB)
    expect(res).toMatchObject({ kind: 'wave', notified: 2 })
    expect(safeTrigger).toHaveBeenCalledTimes(2)
  })

  it('закрита заявка: нічого не пише й нікого не турбує', async () => {
    prisma.job.findUnique.mockResolvedValue(job({ status: 'CANCELLED' }))

    expect(await dispatchJob(JOB)).toEqual({
      kind: 'stop',
      reason: 'job-closed',
    })
    expect(prisma.dispatchEvent.createMany).not.toHaveBeenCalled()
    expect(prisma.job.updateMany).not.toHaveBeenCalled()
    expect(safeTrigger).not.toHaveBeenCalled()
  })

  // Відгуків досить — хвиль більше не буде, і відновлення не має будити
  // базу заради цієї заявки після кожного рестарту.
  it('досить відгуків — розсилка позначається завершеною', async () => {
    prisma.job.findUnique.mockResolvedValue(
      job({ proposalsCount: DISPATCH_CONFIG.ENOUGH_PROPOSALS }),
    )

    await dispatchJob(JOB)
    expect(prisma.job.updateMany).toHaveBeenCalledWith({
      where: { id: JOB, dispatchWave: { lt: FINAL_WAVE } },
      data: { dispatchWave: FINAL_WAVE },
    })
  })

  it('повертає хвилю, скільки покликано і чи був останній дзвінок', async () => {
    expect(await dispatchJob(JOB)).toEqual({
      kind: 'wave',
      wave: 1,
      notified: 2,
      lastCall: false,
    })
  })
})

describe('пропозиція з-за меж виїзду', () => {
  // Майстер сам обрав радіус — і сповіщення це визнає: не «нова заявка для
  // тебе», а «можливо, цікаво», з відстанню й обіцянкою, що рейтинг не
  // постраждає.
  beforeEach(() => {
    prisma.job.findUnique.mockResolvedValue(aged(20, { district: 'center' }))
    prisma.user.findMany.mockResolvedValue([master('picky', 'kotovskoho', 5)])
  })

  it('сповіщення — пропозиція з відстанню, а не «нова заявка»', async () => {
    await dispatchJob(JOB)

    const [row] = prisma.notification.createManyAndReturn.mock.calls[0][0].data
    expect(row).toMatchObject({ userId: 'picky', type: 'NEW_JOB', jobId: JOB })
    expect(row.title).toBe('Можливо, тобі буде цікава ця заявка')
    expect(row.body).toMatch(/^Прибирання\. Це ≈\d+ км — далі, ніж ти/)
    expect(row.body).toContain('на рейтинг це не вплине')
  })

  it('у журналі позначена — щоб не рахуватись у відзивчивість', async () => {
    await dispatchJob(JOB)

    const [event] = prisma.dispatchEvent.createMany.mock.calls[0][0].data
    expect(event).toMatchObject({ masterId: 'picky', beyondReach: true })
  })

  it('звичайне покликання позначки не має', async () => {
    prisma.job.findUnique.mockResolvedValue(job())
    prisma.user.findMany.mockResolvedValue([master('m1')])
    await dispatchJob(JOB)

    const [event] = prisma.dispatchEvent.createMany.mock.calls[0][0].data
    expect(event.beyondReach).toBe(false)
    const [row] = prisma.notification.createManyAndReturn.mock.calls[0][0].data
    expect(row.title).toBe('Є нова заявка для тебе')
  })

  // Не відгукнувся на заявку з іншого кінця міста — не його провина, а
  // наш брак майстрів. Ні відзивчивість, ні навантаження цього не бачать.
  it('пропозиції не рахуються ні у відзивчивість, ні в навантаження', async () => {
    await decide(JOB)

    const wheres = prisma.dispatchEvent.groupBy.mock.calls.map(
      (c: [{ where: Record<string, unknown> }]) => c[0].where,
    )
    expect(wheres).toHaveLength(2)
    for (const where of wheres) expect(where.beyondReach).toBe(false)
  })
})

describe('памʼять диспетчера', () => {
  it('markOpened ставить мітку лише першого разу', async () => {
    await markOpened(JOB, 'm1')

    const where = prisma.dispatchEvent.updateMany.mock.calls[0][0].where
    expect(where).toEqual({ jobId: JOB, masterId: 'm1', openedAt: null })
  })

  it('markResponded ставить мітку лише першого разу', async () => {
    await markResponded(JOB, 'm1')

    const where = prisma.dispatchEvent.updateMany.mock.calls[0][0].where
    expect(where).toEqual({ jobId: JOB, masterId: 'm1', respondedAt: null })
  })

  // Аналітика не має ламати UX.
  it('збій запису аналітики не кидає помилку нагору', async () => {
    prisma.dispatchEvent.updateMany.mockRejectedValue(new Error('db down'))

    await expect(markOpened(JOB, 'm1')).resolves.toBeUndefined()
    await expect(markResponded(JOB, 'm1')).resolves.toBeUndefined()
  })
})
