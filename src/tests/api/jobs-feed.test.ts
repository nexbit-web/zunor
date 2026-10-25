import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import {
  makeEvent,
  sessionUser,
  anonymous,
  failure,
  okJson,
} from '../helpers/event'
import { conditions, districtsIn } from '../helpers/where'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/reference', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/reference')>()),
  getDistricts: (await import('../helpers/districts')).getDistricts,
}))

const { GET } = await import('../../routes/api/jobs/feed/+server')

// Стрічка — єдиний масовий вихід даних назовні: сюди ходить кожен майстер
// при кожному відкритті дашборда. Два ризики: віддати не те (чужі заявки,
// заявки не з того міста) і віддати забагато (сторінка без стелі кладе базу).

const PAGE_SIZE = 20

/** Мінімальний рядок заявки у вигляді, який чекає роут. */
function jobRow(i: number) {
  return {
    id: `job-${i}`,
    title: `Заявка ${i}`,
    description: null,
    metadata: null,
    category: 'cleaning',
    city: 'odesa',
    status: 'OPEN',
    budgetMinCents: null,
    budgetMaxCents: null,
    currency: 'UAH',
    proposalsCount: 0,
    viewsCount: 0,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    client: {
      id: 'client-1',
      name: 'Оля',
      username: null,
      avatar: null,
      avgRatingAsClient: 4.5,
      reviewsCountAsClient: 3,
    },
  }
}

function feedEvent(userId: string, query = '') {
  return makeEvent({
    url: `/api/jobs/feed?view=feed${query}`,
    locals: sessionUser(userId),
  })
}

const activeMaster = {
  role: 'MASTER',
  city: 'odesa',
  masterProfile: {
    isActive: true,
    verificationStatus: 'VERIFIED',
    categories: ['cleaning'],
  },
}

beforeEach(() => {
  resetPrisma()
})

describe('доступ', () => {
  it('гість отримує 401', async () => {
    const res = await failure(() =>
      GET(makeEvent({ url: '/api/jobs/feed', locals: anonymous })),
    )
    expect(res.status).toBe(401)
  })

  it('видалений акаунт із живою сесією отримує 401', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    const res = await failure(() => GET(feedEvent('ghost')))
    expect(res.status).toBe(401)
  })

  // Клієнт не має бачити стрічку майстрів — це чужі заявки з чужими даними.
  it('клієнту стрічка віддає порожньо, а не чужі заявки', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: 'CLIENT',
      city: 'odesa',
      masterProfile: null,
    })

    const body = await okJson<{ jobs: unknown[] }>(() => GET(feedEvent('c1')))
    expect(body.jobs).toEqual([])
    expect(prisma.job.findMany).not.toHaveBeenCalled()
  })

  it('майстер із вимкненим профілем стрічки не бачить', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeMaster,
      masterProfile: { ...activeMaster.masterProfile, isActive: false },
    })

    const body = await okJson<{ jobs: unknown[] }>(() => GET(feedEvent('m1')))
    expect(body.jobs).toEqual([])
  })

  it('майстер без міста стрічки не бачить', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...activeMaster, city: null })

    const body = await okJson<{ jobs: unknown[] }>(() => GET(feedEvent('m1')))
    expect(body.jobs).toEqual([])
  })
})

describe('фільтр не можна розширити з клієнта', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(activeMaster)
    prisma.dispatchEvent.findMany.mockResolvedValue([])
    prisma.job.findMany.mockResolvedValue([])
  })

  // Ключова перевірка: параметр categories може тільки ЗВУЗИТИ список із
  // профілю. Інакше майстер прибирання підписався б на всі категорії разом.
  it('чужа категорія в query не додається до дозволених', async () => {
    await GET(feedEvent('m1', '&categories=repair,plumbing'))

    const where = prisma.job.findMany.mock.calls[0][0].where
    expect(where.category).toEqual({ in: [] })
  })

  it('своя категорія в query звужує вибірку', async () => {
    await GET(feedEvent('m1', '&categories=cleaning'))

    const where = prisma.job.findMany.mock.calls[0][0].where
    expect(where.category).toEqual({ in: ['cleaning'] })
  })

  it('власні заявки майстра у стрічку не потрапляють', async () => {
    await GET(feedEvent('m1'))

    const where = prisma.job.findMany.mock.calls[0][0].where
    expect(where.clientId).toEqual({ not: 'm1' })
    expect(where.status).toBe('OPEN')
    expect(where.expiresAt.gt).toBeInstanceOf(Date)
  })

  // Відмовився від заявки — більше її не бачить. Інакше «чорна мітка»
  // диспетчера нічого не варта: заявка повернулась би у стрічку.
  it('заявки з чорною міткою виключаються', async () => {
    prisma.dispatchEvent.findMany.mockResolvedValue([
      { jobId: 'job-9', declined: true },
      { jobId: 'job-10', declined: true },
    ])

    await GET(feedEvent('m1'))

    const where = prisma.job.findMany.mock.calls[0][0].where
    expect(where.id).toEqual({ notIn: ['job-9', 'job-10'] })
  })
})

// minPrice/maxPrice приходять із query і колись проходили через
// Math.max(0, Math.round(Number(raw) * 100)). Number('abc') === NaN, а Math
// його не «виправляє» — NaN проходив наскрізь. Далі умова
// `minPriceCents !== null` вважала NaN заданим фільтром, і в Prisma їхало
// { gte: NaN } → помилка валідації → 500 замість стрічки.
//
// Той самий клас помилки, що й у /api/notifications?limit=abc: Math.min і
// Math.max не є валідацією числа. Тепер обидва — через moneyParam
// ($lib/server/query), і сміття означає «фільтра немає».
describe('нечислові фільтри ціни', () => {
  // AND стрічки містить і правило видимості (dispatch/feed.ts), тож нижню межу
  // ціни шукаємо за змістом, а не за позицією.
  type Cond = { OR?: { budgetMaxCents?: { gte?: number } }[] }
  const minPriceOf = (where: { AND?: Cond[] }) =>
    where.AND?.find((c) => c.OR?.[0]?.budgetMaxCents)?.OR?.[0]?.budgetMaxCents
      ?.gte

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(activeMaster)
    prisma.dispatchEvent.findMany.mockResolvedValue([])
    prisma.job.findMany.mockResolvedValue([])
  })

  it('сміття в minPrice просто вимикає фільтр', async () => {
    for (const raw of ['abc', 'NaN', '1e999', '   ']) {
      prisma.job.findMany.mockClear()
      await GET(feedEvent('m1', `&minPrice=${raw}`))

      const where = prisma.job.findMany.mock.calls[0][0].where
      expect(minPriceOf(where), raw).toBeUndefined()
    }
  })

  it('сміття в maxPrice — так само', async () => {
    for (const raw of ['abc', 'NaN', '1e999', '   ']) {
      prisma.job.findMany.mockClear()
      await GET(feedEvent('m1', `&maxPrice=${raw}`))

      const where = prisma.job.findMany.mock.calls[0][0].where
      const lte = where.OR?.[0]?.budgetMinCents?.lte
      expect(lte, raw).toBeUndefined()
    }
  })

  // Відʼємна ціна — не помилка клієнта, а спроба зіграти на знак: нижня
  // межа затискається до нуля.
  it('відʼємна ціна затискається до нуля', async () => {
    await GET(feedEvent('m1', '&minPrice=-500'))

    const where = prisma.job.findMany.mock.calls[0][0].where
    expect(minPriceOf(where)).toBe(0)
  })

  it('коректна ціна перетворюється на копійки', async () => {
    await GET(feedEvent('m1', '&maxPrice=1500'))

    const where = prisma.job.findMany.mock.calls[0][0].where
    expect(where.OR[0].budgetMinCents.lte).toBe(150_000)
  })
})

describe('сторінка має стелю', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(activeMaster)
    prisma.dispatchEvent.findMany.mockResolvedValue([])
  })

  // Без стелі один запит витягував би всю таблицю — і в базу, і в пам'ять
  // процесу, і в трафік. Розмір сторінки задає сервер, не клієнт.
  it('віддає не більше PAGE_SIZE, навіть якщо база повернула більше', async () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => jobRow(i))
    prisma.job.findMany.mockResolvedValue(rows)

    const body = await okJson<{ jobs: unknown[]; nextCursor: string | null }>(
      () => GET(feedEvent('m1')),
    )

    expect(body.jobs).toHaveLength(PAGE_SIZE)
    expect(body.nextCursor).toBe(`job-${PAGE_SIZE - 1}`)
    // take = PAGE_SIZE + 1 — «зазирнути на один рядок далі», щоб знати про
    // наступну сторінку без COUNT(*).
    expect(prisma.job.findMany.mock.calls[0][0].take).toBe(PAGE_SIZE + 1)
  })

  it('остання сторінка не має курсора', async () => {
    prisma.job.findMany.mockResolvedValue([jobRow(0), jobRow(1)])

    const body = await okJson<{ jobs: unknown[]; nextCursor: string | null }>(
      () => GET(feedEvent('m1')),
    )

    expect(body.jobs).toHaveLength(2)
    expect(body.nextCursor).toBeNull()
  })

  it('рейтинг клієнта у стрічці — плоский і клієнтський', async () => {
    prisma.job.findMany.mockResolvedValue([jobRow(0)])

    const body = await okJson<{
      jobs: { client: Record<string, unknown> }[]
    }>(() => GET(feedEvent('m1')))

    expect(body.jobs[0].client.avgRating).toBe(4.5)
    expect(body.jobs[0].client).not.toHaveProperty('avgRatingAsClient')
  })
})

describe('стрічка не обганяє розсилку', () => {
  beforeEach(() => {
    prisma.job.findMany.mockResolvedValue([])
  })

  const whereOf = () => prisma.job.findMany.mock.calls[0][0].where

  // Поки кільця ширшають, дальній майстер у стрічці побачив би заявку
  // раніше за ближнього — тому свіжа заявка видна лише покликаному. Саме
  // правило перевіряє dispatch-feed.test.ts; тут — що воно доїхало до запиту.
  it('свіжу заявку бачить лише той, кого розсилка вже покликала', async () => {
    prisma.user.findUnique.mockResolvedValue(activeMaster)
    prisma.dispatchEvent.findMany.mockResolvedValue([
      { jobId: 'job-called', declined: false },
    ])

    await GET(feedEvent('m1'))

    expect(conditions(whereOf(), (c) => 'id' in c)).toContainEqual({
      id: { in: ['job-called'] },
    })
    // Межа «старої» заявки — кінець хвиль, а не «зараз».
    const [byAge] = conditions(whereOf(), (c) => 'createdAt' in c)
    const lte = (byAge.createdAt as { lte: Date }).lte
    expect(Date.now() - lte.getTime()).toBeGreaterThanOrEqual(9 * 60_000)
  })

  it('один запит і на відмови, і на тих, кого покликали', async () => {
    prisma.user.findUnique.mockResolvedValue(activeMaster)
    prisma.dispatchEvent.findMany.mockResolvedValue([])

    await GET(feedEvent('m1'))

    expect(prisma.dispatchEvent.findMany).toHaveBeenCalledTimes(1)
    const where = prisma.dispatchEvent.findMany.mock.calls[0][0].where
    expect(where.masterId).toBe('m1')
    expect(where.OR).toEqual([
      { declined: true },
      { notifiedAt: { gte: expect.any(Date) } },
    ])
  })

  // Межа майстра діє і в стрічці: сказав «до 5 км» — заявки з іншого
  // кінця міста не бачить і там.
  it('межа виїзду фільтрує стрічку за районами', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeMaster,
      district: 'center',
      masterProfile: { ...activeMaster.masterProfile, travelRadiusKm: 5 },
    })
    prisma.dispatchEvent.findMany.mockResolvedValue([])

    await GET(feedEvent('m1'))

    const reach = districtsIn(whereOf())!
    expect(reach).toContain('center')
    expect(reach).toContain('moldavanka')
    expect(reach).not.toContain('kotovskoho')
    // Заявку без району не ховаємо: відстань не перевірити, як і в розсилці.
    expect(conditions(whereOf(), (c) => c.district === null)).toHaveLength(1)
  })

  it('«будь-де» — без фільтра районів', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeMaster,
      district: 'center',
      masterProfile: { ...activeMaster.masterProfile, travelRadiusKm: null },
    })
    prisma.dispatchEvent.findMany.mockResolvedValue([])

    await GET(feedEvent('m1'))

    expect(districtsIn(whereOf())).toBeNull()
  })
})

describe('район і відстань у картці', () => {
  beforeEach(() => {
    prisma.dispatchEvent.findMany.mockResolvedValue([])
  })

  type Place = { district: string | null; distanceKm: number | null }
  const placeOf = async () =>
    (await okJson<{ jobs: { place: Place }[] }>(() => GET(feedEvent('m1'))))
      .jobs[0].place

  it('відстань рахується від району самого майстра', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeMaster,
      district: 'center',
    })
    prisma.job.findMany.mockResolvedValue([
      { ...jobRow(0), district: 'tairova' },
    ])

    const place = await placeOf()
    expect(place.district).toBe('Таїрова')
    // Центр → Таїрова — кілька кілометрів, а не нуль і не пів України.
    expect(place.distanceKm).toBeGreaterThan(3)
    expect(place.distanceKm).toBeLessThan(15)

    expect(prisma.job.findMany.mock.calls[0][0].select.district).toBe(true)
  })

  it('майстер без району бачить район заявки, але не відстань', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeMaster,
      district: null,
    })
    prisma.job.findMany.mockResolvedValue([
      { ...jobRow(0), district: 'tairova' },
    ])

    expect(await placeOf()).toEqual({ district: 'Таїрова', distanceKm: null })
  })

  it('заявка без району — нічого не вигадуємо', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeMaster,
      district: 'center',
    })
    prisma.job.findMany.mockResolvedValue([{ ...jobRow(0), district: null }])

    expect(await placeOf()).toEqual({ district: null, distanceKm: null })
  })
})

describe('view=mine', () => {
  it('віддає лише власні заявки замовника', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: 'CLIENT',
      city: 'odesa',
      masterProfile: null,
    })
    prisma.job.findMany.mockResolvedValue([])

    await GET(
      makeEvent({ url: '/api/jobs/feed?view=mine', locals: sessionUser('c1') }),
    )

    expect(prisma.job.findMany.mock.calls[0][0].where).toEqual({
      clientId: 'c1',
    })
  })
})
