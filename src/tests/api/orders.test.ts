import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import {
  makeEvent,
  sessionUser,
  anonymous,
  failure,
  okJson,
} from '../helpers/event'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))

const ordersList = await import('../../routes/api/orders/+server')
const orderItem = await import('../../routes/api/orders/[id]/+server')
const orderChat = await import('../../routes/api/orders/[id]/chat/+server')

// Замовлення — це вже угода, тобто найчутливіші дані після переписки: тут
// з'являються повне ім'я, історія подій і посилання на чат. Доступ мають
// рівно двоє.

const CLIENT = 'client-1'
const MASTER = 'master-1'

function order(patch: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    title: 'Прибирання',
    description: 'опис',
    priceCents: 80_000,
    currency: 'UAH',
    status: 'CREATED',
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    cancelledById: null,
    clientId: CLIENT,
    masterId: MASTER,
    chatId: null,
    client: {
      id: CLIENT,
      name: 'Оля',
      username: null,
      avatar: null,
      city: 'odesa',
    },
    master: {
      id: MASTER,
      name: 'Іван',
      username: 'ivan',
      avatar: null,
      city: 'odesa',
      avgRatingAsMaster: 4.8,
      reviewsCountAsMaster: 12,
    },
    reviews: [],
    events: [],
    ...patch,
  }
}

beforeEach(() => {
  resetPrisma()
  prisma.order.findMany.mockResolvedValue([])
  prisma.order.findUnique.mockResolvedValue(order())
})

describe('GET /api/orders — список', () => {
  function listEvent(userId: string, query = '') {
    return makeEvent({
      url: `/api/orders${query}`,
      locals: sessionUser(userId),
    })
  }

  it('гість — 401', async () => {
    const res = await failure(() =>
      ordersList.GET(makeEvent({ url: '/api/orders', locals: anonymous })),
    )
    expect(res.status).toBe(401)
  })

  // Головне: у вибірці ЗАВЖДИ є прив'язка до себе — або як клієнт, або як
  // майстер. Без неї список замовлень став би списком усіх угод сервісу.
  it('без ролі бачить лише свої угоди з обох боків', async () => {
    await ordersList.GET(listEvent(CLIENT))

    const where = prisma.order.findMany.mock.calls[0][0].where
    expect(where.AND[0]).toEqual({
      OR: [{ clientId: CLIENT }, { masterId: CLIENT }],
    })
  })

  it('role=client звужує до власних замовлень', async () => {
    await ordersList.GET(listEvent(CLIENT, '?role=client'))
    expect(prisma.order.findMany.mock.calls[0][0].where.AND[0]).toEqual({
      clientId: CLIENT,
    })
  })

  it('role=master звужує до своїх робіт', async () => {
    await ordersList.GET(listEvent(MASTER, '?role=master'))
    expect(prisma.order.findMany.mock.calls[0][0].where.AND[0]).toEqual({
      masterId: MASTER,
    })
  })

  // Довільний role із query не має перетворюватись на порожній фільтр.
  it('невідомий role падає у безпечний варіант «обидва боки»', async () => {
    await ordersList.GET(listEvent(CLIENT, '?role=admin'))
    expect(prisma.order.findMany.mock.calls[0][0].where.AND[0]).toEqual({
      OR: [{ clientId: CLIENT }, { masterId: CLIENT }],
    })
  })

  it('статуси беруться з білого списку, а не з query як є', async () => {
    await ordersList.GET(listEvent(CLIENT, '?status=ACTIVE'))
    expect(prisma.order.findMany.mock.calls[0][0].where.AND[1]).toEqual({
      status: { in: ['CREATED', 'IN_PROGRESS'] },
    })

    resetPrisma()
    prisma.order.findMany.mockResolvedValue([])
    await ordersList.GET(listEvent(CLIENT, '?status=DROP_TABLE'))
    expect(prisma.order.findMany.mock.calls[0][0].where.AND[1]).toEqual({})
  })

  it('видача має стелю', async () => {
    await ordersList.GET(listEvent(CLIENT))
    expect(prisma.order.findMany.mock.calls[0][0].take).toBe(100)
  })

  // Телефон з'являється лише на сторінці конкретного замовлення, у списку
  // його немає навмисно (захист контактів до угоди з маніфесту).
  it('у списку немає телефонів', async () => {
    await ordersList.GET(listEvent(CLIENT))

    const select = prisma.order.findMany.mock.calls[0][0].select
    expect(select.client.select).not.toHaveProperty('phone')
    expect(select.master.select).not.toHaveProperty('phone')
  })
})

describe('GET /api/orders/[id] — деталі', () => {
  function itemEvent(userId: string) {
    return makeEvent({ params: { id: 'order-1' }, locals: sessionUser(userId) })
  }

  it('гість — 401', async () => {
    const res = await failure(() =>
      orderItem.GET(
        makeEvent({ params: { id: 'order-1' }, locals: anonymous }),
      ),
    )
    expect(res.status).toBe(401)
  })

  it('неіснуюче замовлення — 404', async () => {
    prisma.order.findUnique.mockResolvedValue(null)
    expect((await failure(() => orderItem.GET(itemEvent(CLIENT)))).status).toBe(
      404,
    )
  })

  it('стороння людина не бачить чужу угоду', async () => {
    const res = await failure(() => orderItem.GET(itemEvent('stranger')))
    expect(res.status).toBe(403)
  })

  it('клієнт і майстер бачать свою угоду', async () => {
    for (const userId of [CLIENT, MASTER]) {
      const body = await okJson<{ order: { id: string } }>(() =>
        orderItem.GET(itemEvent(userId)),
      )
      expect(body.order.id).toBe('order-1')
    }
  })

  it('рейтинг майстра віддається плоским контрактом', async () => {
    const body = await okJson<{ order: { master: Record<string, unknown> } }>(
      () => orderItem.GET(itemEvent(CLIENT)),
    )

    expect(body.order.master.avgRating).toBe(4.8)
    expect(body.order.master).not.toHaveProperty('avgRatingAsMaster')
  })
})

describe('POST /api/orders/[id]/chat — відкрити чат', () => {
  function chatEvent(userId: string) {
    return makeEvent({ params: { id: 'order-1' }, locals: sessionUser(userId) })
  }

  beforeEach(() => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      clientId: CLIENT,
      masterId: MASTER,
      chatId: null,
    })
    prisma.chat.create.mockResolvedValue({ id: 'chat-new' })
  })

  it('гість — 401', async () => {
    const res = await failure(() =>
      orderChat.POST(
        makeEvent({ params: { id: 'order-1' }, locals: anonymous }),
      ),
    )
    expect(res.status).toBe(401)
  })

  // Тут навмисно 404, а не 403: 403 підтвердив би, що замовлення існує,
  // і дозволив би перебором зібрати карту бази.
  it('стороння людина отримує 404, а не 403', async () => {
    const res = await failure(() => orderChat.POST(chatEvent('stranger')))
    expect(res.status).toBe(404)
    expect(prisma.chat.create).not.toHaveBeenCalled()
  })

  it('створює чат рівно з двома учасниками угоди', async () => {
    const res = (await orderChat.POST(chatEvent(CLIENT))) as Response
    expect(res.status).toBe(201)

    const members = prisma.chat.create.mock.calls[0][0].data.members.create
    expect(members).toEqual([{ userId: CLIENT }, { userId: MASTER }])
    expect(prisma.order.update.mock.calls[0][0].data.chatId).toBe('chat-new')
  })

  // Ідемпотентність: два швидких кліки не мають плодити два чати.
  it('існуючий чат просто повертається, без створення нового', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      clientId: CLIENT,
      masterId: MASTER,
      chatId: 'chat-old',
    })

    const body = await okJson<{ chatId: string }>(() =>
      orderChat.POST(chatEvent(CLIENT)),
    )

    expect(body.chatId).toBe('chat-old')
    expect(prisma.chat.create).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  // Гонка: перше читання показало null, але поки йшла транзакція, чат уже
  // створив хтось інший. Перечитування всередині транзакції це ловить.
  it('чат, створений паралельно, не дублюється', async () => {
    prisma.order.findUnique
      .mockResolvedValueOnce({
        id: 'order-1',
        clientId: CLIENT,
        masterId: MASTER,
        chatId: null,
      })
      // виклик усередині транзакції вже бачить створений чат
      .mockResolvedValueOnce({ chatId: 'chat-parallel' })

    const body = await okJson<{ chatId: string }>(() =>
      orderChat.POST(chatEvent(CLIENT)),
    )

    expect(body.chatId).toBe('chat-parallel')
    expect(prisma.chat.create).not.toHaveBeenCalled()
  })
})
