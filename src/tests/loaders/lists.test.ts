import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { makeEvent, sessionUser, anonymous } from '../helpers/event'

const getCategories = vi.fn(async () => [
  { slug: 'cleaning', name: 'Прибирання' },
])
const getCities = vi.fn(async () => [
  { slug: 'odesa', name: 'Одеса', region: 'Одеська', isCapital: false },
])

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/reference', () => ({ getCategories, getCities }))

const dashboardPage = await import('../../routes/(auth)/dashboard/+page.server')
const jobsPage = await import('../../routes/(auth)/dashboard/jobs/+page.server')
const ordersPage =
  await import('../../routes/(auth)/dashboard/orders/+page.server')
const notificationsPage =
  await import('../../routes/(auth)/dashboard/notifications/+page.server')
const assistantPage =
  await import('../../routes/(auth)/dashboard/settings/assistant/+page.server')
const messagesLayout =
  await import('../../routes/(auth)/dashboard/messages/+layout.server')

// Лоадери списків. У кожного дві обіцянки, і обидві легко зламати непомітно:
//
//   1. вибірка ЗАВЖДИ звужена до себе — інакше сторінка показує чужі дані;
//   2. у видачі є стеля — інакше один акаунт із довгою історією тягне пів
//      бази в пам'ять процесу на кожне відкриття сторінки.

/** Ловить кинутий redirect() і повертає location. */
async function redirectOf(run: () => unknown): Promise<string> {
  try {
    await run()
  } catch (err) {
    const e = err as { location?: string }
    if (typeof e?.location === 'string') return e.location
    throw err
  }
  throw new Error('Очікувався редірект, але його не було')
}

function withAccount(
  userId: string,
  account: Record<string, unknown> | null,
): Record<string, unknown> {
  return { ...sessionUser(userId), account }
}

const USER = 'user-1'

beforeEach(() => {
  resetPrisma()
  getCategories.mockClear()
  getCities.mockClear()
  prisma.order.findMany.mockResolvedValue([])
  prisma.notification.findMany.mockResolvedValue([])
  prisma.notification.count.mockResolvedValue(0)
  prisma.job.findMany.mockResolvedValue([])
  prisma.job.count.mockResolvedValue(0)
  prisma.job.groupBy.mockResolvedValue([])
  prisma.review.findMany.mockResolvedValue([])
  prisma.order.count.mockResolvedValue(0)
  prisma.city.findUnique.mockResolvedValue({ name: 'Одеса' })
})

describe('дашборд', () => {
  it('гостя веде на логін', async () => {
    expect(
      await redirectOf(() =>
        dashboardPage.load(makeEvent({ locals: anonymous })),
      ),
    ).toContain('/user/login')
  })

  it('видалений акаунт із живою сесією — на логін', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    expect(
      await redirectOf(() =>
        dashboardPage.load(makeEvent({ locals: sessionUser(USER) })),
      ),
    ).toBe('/user/login')
  })

  // Свій телефон бачити можна — це власний профіль. Важливо інше: рядок
  // тягнеться явним select, без aiProfile і банових полів.
  it('свій профіль вантажиться вузьким select, без службових полів', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER,
      name: 'Оля',
      username: null,
      avatar: null,
      bio: null,
      phone: '+380671111111',
      role: 'CLIENT',
      city: 'odesa',
      createdAt: new Date(),
      avgRatingAsMaster: 0,
      reviewsCountAsMaster: 0,
      avgRatingAsClient: 4.5,
      reviewsCountAsClient: 2,
      masterProfile: null,
    })

    const data = (await dashboardPage.load(
      makeEvent({ locals: sessionUser(USER) }),
    )) as { user: { phone?: string } }

    const select = prisma.user.findUnique.mock.calls[0][0].select
    expect(select).not.toHaveProperty('aiProfile')
    expect(select).not.toHaveProperty('banned')
    // Власний телефон у власному кабінеті — це нормально.
    expect(data.user.phone).toBe('+380671111111')
  })
})

describe('сторінка заявок', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue({
      role: 'CLIENT',
      city: 'odesa',
      masterProfile: null,
    })
  })

  it('гостя веде на логін', async () => {
    expect(
      await redirectOf(() =>
        jobsPage.load(makeEvent({ url: '/dashboard/jobs', locals: anonymous })),
      ),
    ).toContain('/user/login')
  })

  it('«мої заявки» звужені до себе і мають стелю сторінки', async () => {
    await jobsPage.load(
      makeEvent({
        url: '/dashboard/jobs?view=mine',
        locals: sessionUser(USER),
      }),
    )

    const args = prisma.job.findMany.mock.calls[0][0]
    expect(args.where.clientId).toBe(USER)
    expect(args.take).toBe(21)
  })

  // ?view приходить з URL — приймаємо лише відомі значення, інакше дефолт
  // за роллю. Довільний рядок не має ставати новим режимом вибірки.
  it('невідомий view падає у дефолт за роллю', async () => {
    await jobsPage.load(
      makeEvent({
        url: '/dashboard/jobs?view=everything',
        locals: sessionUser(USER),
      }),
    )

    // Клієнт → mine, тобто фільтр по собі лишається.
    expect(prisma.job.findMany.mock.calls[0][0].where.clientId).toBe(USER)
  })

  // Довідники — з кеша в пам'яті процесу: на Neon зайвий SELECT у лоадері,
  // що спрацьовує на кожен вхід, тримає базу розбудженою даремно.
  it('довідники беруться з кеша, а не з бази', async () => {
    await jobsPage.load(
      makeEvent({ url: '/dashboard/jobs', locals: sessionUser(USER) }),
    )

    expect(getCategories).toHaveBeenCalled()
    expect(getCities).toHaveBeenCalled()
    expect(prisma.category.findMany).not.toHaveBeenCalled()
    expect(prisma.city.findMany).not.toHaveBeenCalled()
  })
})

describe('сторінка замовлень', () => {
  it('гостя веде на логін', async () => {
    expect(
      await redirectOf(() =>
        ordersPage.load(
          makeEvent({ url: '/dashboard/orders', locals: anonymous }),
        ),
      ),
    ).toContain('/user/login')
  })

  it('без фільтра показує лише свої угоди з обох боків', async () => {
    await ordersPage.load(
      makeEvent({ url: '/dashboard/orders', locals: sessionUser(USER) }),
    )

    const args = prisma.order.findMany.mock.calls[0][0]
    expect(args.where.AND[0]).toEqual({
      OR: [{ clientId: USER }, { masterId: USER }],
    })
    expect(args.take).toBe(200)
  })

  it('невідомий role із query не розширює вибірку', async () => {
    await ordersPage.load(
      makeEvent({
        url: '/dashboard/orders?role=admin',
        locals: sessionUser(USER),
      }),
    )

    expect(prisma.order.findMany.mock.calls[0][0].where.AND[0]).toEqual({
      OR: [{ clientId: USER }, { masterId: USER }],
    })
  })

  // Роль уже прочитана guardHandle — окремий SELECT був би другим запитом
  // за ту саму колонку на кожен вхід на сторінку.
  it('роль береться з locals.account без запиту в базу', async () => {
    const data = (await ordersPage.load(
      makeEvent({
        url: '/dashboard/orders',
        locals: withAccount(USER, { role: 'MASTER' }),
      }),
    )) as { userRole: string }

    expect(data.userRole).toBe('MASTER')
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('поза дашбордом фолбек — CLIENT, а не падіння', async () => {
    const data = (await ordersPage.load(
      makeEvent({ url: '/dashboard/orders', locals: sessionUser(USER) }),
    )) as { userRole: string }

    expect(data.userRole).toBe('CLIENT')
  })

  // У списку телефонів немає навмисно: вони живуть лише на сторінці
  // конкретного замовлення.
  it('у списку немає телефонів', async () => {
    await ordersPage.load(
      makeEvent({ url: '/dashboard/orders', locals: sessionUser(USER) }),
    )

    const select = prisma.order.findMany.mock.calls[0][0].select
    expect(select.client.select).not.toHaveProperty('phone')
    expect(select.master.select).not.toHaveProperty('phone')
  })
})

describe('сторінка сповіщень', () => {
  it('гостя веде на логін', async () => {
    expect(
      await redirectOf(() =>
        notificationsPage.load(makeEvent({ locals: anonymous })),
      ),
    ).toContain('/user/login')
  })

  it('вибірка і лічильник звужені до себе, сторінка має стелю', async () => {
    await notificationsPage.load(makeEvent({ locals: sessionUser(USER) }))

    expect(prisma.notification.findMany.mock.calls[0][0].where.userId).toBe(
      USER,
    )
    expect(prisma.notification.findMany.mock.calls[0][0].take).toBe(21)
    expect(prisma.notification.count.mock.calls[0][0].where).toEqual({
      userId: USER,
      isRead: false,
    })
  })

  // Сторінка не заводить власної Pusher-підписки — події приходять зі
  // спільного стору. Тому userId назовні не потрібен і не віддається.
  it('userId у payload сторінки не їде', async () => {
    const data = await notificationsPage.load(
      makeEvent({ locals: sessionUser(USER) }),
    )
    expect(data).not.toHaveProperty('userId')
  })
})

describe('налаштування асистента', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue({ aiProfile: null })
  })

  it('гостя веде на логін', async () => {
    expect(
      await redirectOf(() =>
        assistantPage.load(makeEvent({ locals: anonymous })),
      ),
    ).toContain('/user/login')
  })

  // Другий рубіж після фільтра в меню: прямий перехід за URL майстра
  // сюди не пустить. Анкета — інструмент замовника.
  it('майстра розвертає — анкета лише для замовників', async () => {
    expect(
      await redirectOf(() =>
        assistantPage.load(
          makeEvent({ locals: withAccount('m1', { role: 'MASTER' }) }),
        ),
      ),
    ).toBe('/dashboard/settings/appearance')
  })

  it('клієнта пускає', async () => {
    const data = await assistantPage.load(
      makeEvent({ locals: withAccount('c1', { role: 'CLIENT' }) }),
    )
    expect(data).toBeDefined()
  })
})

describe('лейаут повідомлень', () => {
  it('гостя веде на логін', async () => {
    expect(
      await redirectOf(() =>
        messagesLayout.load(makeEvent({ locals: anonymous })),
      ),
    ).toContain('/user/login')
  })
})
