import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from './helpers/prisma-mock'
import { Notify, resetInfra } from './helpers/infra'
import { DISPATCH_CONFIG } from '$lib/server/dispatch/types'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('./helpers/prisma-mock')).prisma,
}))
vi.mock(
  '$lib/server/notifications',
  async () => await import('./helpers/infra'),
)

const { decide } = await import('$lib/server/dispatch/engine')
const { dispatchJob } = await import('$lib/server/dispatch')
const { markOpened, markResponded } = await import('$lib/server/dispatch/log')

// Мозок-диспетчер. Це не технічна деталь, а саме УТП продукту: «push, а не
// pull» і «справедливий маркетплейс» із маніфесту. Тести тримають чотири
// обіцянки, які легко зламати непомітно:
//
//   1. зупинки працюють (закрита заявка, досить відгуків) — інакше розсилка
//      перетворюється на спам, за який майстри йдуть із сервісу;
//   2. нікого не сповіщаємо двічі — дубль виглядає як несправність;
//   3. хвиля рахується з ВІКУ заявки, а не з лічильника — тому рестарт
//      процесу нічого не ламає;
//   4. claim відбувається ДО відправки, під локом — інакше два паралельні
//      виклики покличуть тих самих майстрів.
//
// Скоринг сам по собі покритий окремо (dispatch-scoring.test.ts).

const JOB = 'job-1'
const CLIENT = 'client-1'

function job(patch: Record<string, unknown> = {}) {
  return {
    id: JOB,
    category: 'cleaning',
    city: 'odesa',
    clientId: CLIENT,
    status: 'OPEN',
    proposalsCount: 0,
    createdAt: new Date(),
    ...patch,
  }
}

/** Майстер у вигляді, який повертає findMany у loadCandidates. */
function master(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    isOnline: false,
    lastSeen: new Date(Date.now() - 60_000),
    avgRatingAsMaster: 4.5,
    masterProfile: {
      verificationStatus: 'VERIFIED',
      completedOrders: 30,
      createdAt: new Date(Date.now() - 400 * 86_400_000),
    },
    ...patch,
  }
}

/** Порожні агрегати — майстер без активних замовлень і без історії розсилок. */
function noAggregates() {
  prisma.order.groupBy.mockResolvedValue([])
  prisma.dispatchEvent.groupBy.mockResolvedValue([])
}

beforeEach(() => {
  resetPrisma()
  resetInfra()
  prisma.job.findUnique.mockResolvedValue(job())
  prisma.dispatchEvent.findMany.mockResolvedValue([])
  prisma.user.findMany.mockResolvedValue([])
  noAggregates()
})

describe('зупинки розсилки', () => {
  it('заявки немає — job-closed', async () => {
    prisma.job.findUnique.mockResolvedValue(null)

    const d = await decide(JOB)
    expect(d.shouldDispatch).toBe(false)
    expect(d.stopReason).toBe('job-closed')
    // До кандидатів навіть не доходимо — база не будиться даремно.
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })

  it('заявка вже не OPEN — job-closed', async () => {
    for (const status of ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED']) {
      prisma.job.findUnique.mockResolvedValue(job({ status }))

      const d = await decide(JOB)
      expect(d.stopReason).toBe('job-closed')
    }
  })

  // Поріг із маніфесту: клієнту досить вибору, майстрам — не спам.
  it('досить відгуків — enough-proposals', async () => {
    prisma.job.findUnique.mockResolvedValue(
      job({ proposalsCount: DISPATCH_CONFIG.ENOUGH_PROPOSALS }),
    )

    const d = await decide(JOB)
    expect(d.stopReason).toBe('enough-proposals')
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })

  it('на одного менше порога — розсилка триває', async () => {
    prisma.job.findUnique.mockResolvedValue(
      job({ proposalsCount: DISPATCH_CONFIG.ENOUGH_PROPOSALS - 1 }),
    )
    prisma.user.findMany.mockResolvedValue([master('m1')])

    const d = await decide(JOB)
    expect(d.shouldDispatch).toBe(true)
  })

  it('нема кого кликати — no-candidates', async () => {
    const d = await decide(JOB)
    expect(d.stopReason).toBe('no-candidates')
  })
})

describe('кого беремо в кандидати', () => {
  it('фільтр: активний майстер свого міста й категорії, крім самого клієнта', async () => {
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

  // Пул тягнеться в пам'ять процесу — без стелі одна заявка в великому
  // місті витягла б усіх майстрів разом із агрегатами.
  it('пул кандидатів має стелю і бере спершу свіжих', async () => {
    prisma.user.findMany.mockResolvedValue([master('m1')])
    await decide(JOB)

    const args = prisma.user.findMany.mock.calls[0][0]
    expect(args.take).toBe(500)
    expect(args.orderBy).toEqual({ lastSeen: 'desc' })
  })

  // Головне правило проти дублів: кого вже кликали — того не кличемо.
  it('уже сповіщені не потрапляють у вибірку', async () => {
    prisma.dispatchEvent.findMany.mockResolvedValue([
      { masterId: 'm1' },
      { masterId: 'm2' },
    ])
    prisma.user.findMany.mockResolvedValue([
      master('m1'),
      master('m2'),
      master('m3'),
    ])

    const d = await decide(JOB)
    expect(d.toNotify.map((c) => c.id)).toEqual(['m3'])
  })

  it('майстер без профілю відсіюється, а не падає', async () => {
    prisma.user.findMany.mockResolvedValue([
      master('m1', { masterProfile: null }),
    ])

    const d = await decide(JOB)
    expect(d.stopReason).toBe('no-candidates')
  })

  // Агрегати рахуються одним groupBy на весь пул, а не підзапитом на майстра:
  // інакше кожна хвиля — це N запитів до Neon.
  it('агрегати беруться пакетом, а не по одному майстру', async () => {
    prisma.user.findMany.mockResolvedValue([
      master('m1'),
      master('m2'),
      master('m3'),
    ])

    await decide(JOB)

    expect(prisma.order.groupBy).toHaveBeenCalledTimes(1)
    expect(prisma.dispatchEvent.groupBy).toHaveBeenCalledTimes(3)
    expect(
      prisma.order.groupBy.mock.calls[0][0].where.masterId.in,
    ).toHaveLength(3)
  })
})

describe('хвилі рахуються з віку заявки', () => {
  // Номер хвилі НЕ зберігається ніде: він виводиться з createdAt. Саме тому
  // рестарт процесу (з втратою таймерів) нічого не ламає — страхувальний
  // крон порахує ту саму хвилю.
  const cases: [string, number, number][] = [
    ['щойно створена', 0, 1],
    ['через хвилину — ще перша хвиля', 1, 1],
    ['через 2 хвилини — друга', 2, 2],
    ['через 5 хвилин — усе ще друга', 5, 2],
    ['через 10 хвилин — третя', 10, 3],
    ['через добу — третя', 1440, 3],
  ]

  for (const [label, ageMin, expectedWave] of cases) {
    it(label, async () => {
      prisma.job.findUnique.mockResolvedValue(
        job({ createdAt: new Date(Date.now() - ageMin * 60_000) }),
      )
      prisma.user.findMany.mockResolvedValue([master('m1')])

      const d = await decide(JOB)
      expect(d.wave).toBe(expectedWave)
    })
  }
})

describe('скільки кличемо за хвилю', () => {
  function pool(n: number) {
    return Array.from({ length: n }, (_, i) => master(`m${i}`))
  }

  it('перша хвиля обмежена своїм batchSize', async () => {
    prisma.user.findMany.mockResolvedValue(pool(100))

    const d = await decide(JOB)
    expect(d.toNotify).toHaveLength(DISPATCH_CONFIG.WAVES[0].batchSize)
  })

  // Ліміт накопичувальний: на другій хвилі ціль — сума перших двох,
  // мінус ті, кого вже покликали.
  it('друга хвиля добирає до сумарної цілі, не з нуля', async () => {
    const alreadyNotified = DISPATCH_CONFIG.WAVES[0].batchSize
    prisma.dispatchEvent.findMany.mockResolvedValue(
      Array.from({ length: alreadyNotified }, (_, i) => ({
        masterId: `old${i}`,
      })),
    )
    prisma.job.findUnique.mockResolvedValue(
      job({ createdAt: new Date(Date.now() - 3 * 60_000) }),
    )
    prisma.user.findMany.mockResolvedValue(pool(200))

    const d = await decide(JOB)
    expect(d.wave).toBe(2)
    expect(d.toNotify).toHaveLength(DISPATCH_CONFIG.WAVES[1].batchSize)
  })

  it('слоти вичерпані — нічого не робимо, але це не «зупинка»', async () => {
    prisma.dispatchEvent.findMany.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => ({ masterId: `old${i}` })),
    )
    prisma.user.findMany.mockResolvedValue(pool(10))

    const d = await decide(JOB)
    expect(d.shouldDispatch).toBe(false)
    expect(d.toNotify).toHaveLength(0)
    // stopReason немає: заявка жива, просто ліміт хвилі вибрано.
    expect(d.stopReason).toBeUndefined()
  })

  // Третя хвиля навмисно «всі решта»: якщо за 10 хвилин відгуків нема,
  // краще покликати всіх, ніж лишити клієнта ні з чим.
  it('третя хвиля забирає весь пул', async () => {
    prisma.job.findUnique.mockResolvedValue(
      job({ createdAt: new Date(Date.now() - 20 * 60_000) }),
    )
    prisma.user.findMany.mockResolvedValue(pool(120))

    const d = await decide(JOB)
    expect(d.wave).toBe(3)
    expect(d.toNotify).toHaveLength(120)
  })

  it('кандидати віддаються відсортованими за score', async () => {
    prisma.user.findMany.mockResolvedValue(pool(30))

    const d = await decide(JOB)
    const scores = d.toNotify.map((c) => c.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })
})

describe('dispatchJob: лок, claim, відправка', () => {
  beforeEach(() => {
    prisma.user.findMany.mockResolvedValue([master('m1'), master('m2')])
  })

  // Рішення й claim мусять бути в ОДНІЙ транзакції під advisory-локом:
  // інакше створення заявки й тік крона одночасно виберуть тих самих
  // майстрів і надішлють дубль.
  it('бере advisory-лок і працює в одній транзакції', async () => {
    await dispatchJob(JOB, 'Прибирання')

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
  })

  it('столбить майстрів ДО відправки пушів', async () => {
    await dispatchJob(JOB, 'Прибирання')

    const created = prisma.dispatchEvent.createMany.mock.calls[0][0]
    expect(created.data).toHaveLength(2)
    expect(created.skipDuplicates).toBe(true)
    expect(created.data[0]).toMatchObject({ jobId: JOB, wave: 1 })
    expect(Notify.newJob).toHaveBeenCalledTimes(2)
  })

  it('кожен покликаний отримує сповіщення з назвою заявки', async () => {
    await dispatchJob(JOB, 'Прибирання квартири')

    expect(Notify.newJob).toHaveBeenCalledWith('m1', JOB, 'Прибирання квартири')
    expect(Notify.newJob).toHaveBeenCalledWith('m2', JOB, 'Прибирання квартири')
  })

  // Пуш одного майстра не має зривати розсилку решті.
  it('збій сповіщення одному не зриває інших', async () => {
    Notify.newJob.mockRejectedValueOnce(new Error('pusher down'))

    const res = await dispatchJob(JOB, 'Прибирання')
    expect(res.notified).toBe(2)
    expect(Notify.newJob).toHaveBeenCalledTimes(2)
  })

  it('зупинка не пише в журнал і нікого не турбує', async () => {
    prisma.job.findUnique.mockResolvedValue(job({ status: 'CANCELLED' }))

    const res = await dispatchJob(JOB, 'Прибирання')
    expect(res).toMatchObject({ notified: 0, stopped: 'job-closed' })
    expect(prisma.dispatchEvent.createMany).not.toHaveBeenCalled()
    expect(Notify.newJob).not.toHaveBeenCalled()
  })

  it('повертає скільки покликано і в якій хвилі', async () => {
    const res = await dispatchJob(JOB, 'Прибирання')
    expect(res).toEqual({ notified: 2, wave: 1 })
  })
})

describe('памʼять диспетчера', () => {
  // Аналітика не має ламати UX: обидва хелпери fail-soft.
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

  it('збій запису аналітики не кидає помилку нагору', async () => {
    prisma.dispatchEvent.updateMany.mockRejectedValue(new Error('db down'))

    await expect(markOpened(JOB, 'm1')).resolves.toBeUndefined()
    await expect(markResponded(JOB, 'm1')).resolves.toBeUndefined()
  })
})
