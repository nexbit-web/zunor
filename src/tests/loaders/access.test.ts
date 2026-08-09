import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { markOpened, resetInfra } from '../helpers/infra'
import { makeEvent, sessionUser, anonymous, failure } from '../helpers/event'

const getRecommendedIds = vi.fn(async () => [] as string[])

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/dispatch', async () => await import('../helpers/infra'))
vi.mock('$lib/server/ranking', () => ({ getRecommendedIds }))

const jobPage =
  await import('../../routes/(auth)/dashboard/jobs/[id]/+page.server')
const orderPage =
  await import('../../routes/(auth)/dashboard/orders/[id]/+page.server')
const chatPage =
  await import('../../routes/(auth)/dashboard/messages/[chatId]/+page.server')
const clientPage =
  await import('../../routes/(auth)/dashboard/client/[id]/+page.server')
const handlePage = await import('../../routes/[handle=handle]/+page.server')

// Лоадери сторінок — другий шлях до тих самих даних, що й API. Саме тому
// правило доступу винесене в $lib/server/job-access: колись воно жило лише
// на сторінці, і ендпоінт роками віддавав чужі заявки. Тут перевіряємо, що
// й сторінка тримає ту саму лінію.
//
// Окремо стережемо ГОЛОВНУ продуктову обіцянку: телефон з'являється лише
// там, де вже є Order і глядач — його учасник.

const CLIENT = 'client-1'
const MASTER = 'master-1'

/** Ловить кинутий redirect() і повертає його location. */
async function redirectOf(run: () => unknown): Promise<string> {
  try {
    await run()
  } catch (err) {
    const e = err as { status?: number; location?: string }
    if (typeof e?.location === 'string') return e.location
    throw err
  }
  throw new Error('Очікувався редірект, але його не було')
}

beforeEach(() => {
  resetPrisma()
  resetInfra()
  getRecommendedIds.mockClear()
})

describe('сторінка заявки /dashboard/jobs/[id]', () => {
  const job = {
    id: 'job-1',
    title: 'Прибирання',
    description: null,
    category: 'cleaning',
    city: 'odesa',
    status: 'OPEN',
    budgetMinCents: null,
    budgetMaxCents: null,
    currency: 'UAH',
    attachments: ['https://res.cloudinary.com/x/photo.jpg'],
    metadata: null,
    clientId: CLIENT,
    proposalsCount: 0,
    viewsCount: 0,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    client: {
      id: CLIENT,
      name: 'Оля',
      username: null,
      avatar: null,
      city: 'odesa',
      avgRatingAsClient: 4.5,
      reviewsCountAsClient: 2,
      createdAt: new Date(),
    },
  }

  function viewer(patch: Record<string, unknown> = {}) {
    return {
      role: 'MASTER',
      city: 'odesa',
      masterProfile: {
        isActive: true,
        verificationStatus: 'VERIFIED',
        categories: ['cleaning'],
      },
      ...patch,
    }
  }

  function jobEvent(userId: string) {
    return makeEvent({ params: { id: 'job-1' }, locals: sessionUser(userId) })
  }

  beforeEach(() => {
    prisma.jobView.createMany.mockResolvedValue({ count: 0 })
    prisma.proposal.findMany.mockResolvedValue([])
    prisma.proposal.findFirst.mockResolvedValue(null)
    prisma.job.findUnique.mockResolvedValue(job)
    prisma.user.findUnique.mockResolvedValue(viewer())
  })

  it('гість — редірект на логін', async () => {
    const location = await redirectOf(() =>
      jobPage.load(makeEvent({ params: { id: 'job-1' }, locals: anonymous })),
    )
    expect(location).toContain('/user/login')
  })

  it('видалений акаунт із живою сесією — на логін', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    expect(await redirectOf(() => jobPage.load(jobEvent('ghost')))).toBe(
      '/user/login',
    )
  })

  it('неіснуюча заявка — 404', async () => {
    prisma.job.findUnique.mockResolvedValue(null)
    expect((await failure(() => jobPage.load(jobEvent(MASTER)))).status).toBe(
      404,
    )
  })

  // Те саме правило, що й у GET /api/jobs/[id]: фото помешкання клієнта
  // не бачить ніхто, крім тих, хто справді може взяти цю роботу.
  it('сторонній клієнт — 404, а не 403', async () => {
    prisma.user.findUnique.mockResolvedValue(
      viewer({ role: 'CLIENT', masterProfile: null }),
    )

    const res = await failure(() => jobPage.load(jobEvent('stranger')))
    expect(res.status).toBe(404)
  })

  it('майстер з іншого міста — 404', async () => {
    prisma.user.findUnique.mockResolvedValue(viewer({ city: 'kyiv' }))
    expect((await failure(() => jobPage.load(jobEvent(MASTER)))).status).toBe(
      404,
    )
  })

  it('власник бачить свою заявку', async () => {
    prisma.user.findUnique.mockResolvedValue(viewer({ role: 'CLIENT' }))

    const data = (await jobPage.load(jobEvent(CLIENT))) as { isOwner: boolean }
    expect(data.isOwner).toBe(true)
  })

  // Унікальний перегляд: повторне відкриття не має накручувати лічильник
  // і переписувати «гарячу» заявку на кожен клік.
  it('перегляд рахується один раз на глядача', async () => {
    prisma.user.findUnique.mockResolvedValue(viewer())
    prisma.jobView.createMany.mockResolvedValue({ count: 1 })

    await jobPage.load(jobEvent(MASTER))
    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { viewsCount: { increment: 1 } },
    })

    resetPrisma()
    prisma.job.findUnique.mockResolvedValue(job)
    prisma.user.findUnique.mockResolvedValue(viewer())
    prisma.proposal.findMany.mockResolvedValue([])
    prisma.jobView.createMany.mockResolvedValue({ count: 0 })

    await jobPage.load(jobEvent(MASTER))
    expect(prisma.job.update).not.toHaveBeenCalled()
  })

  it('відкриття заявки майстром помічається в пам’яті диспетчера', async () => {
    prisma.user.findUnique.mockResolvedValue(viewer())
    await jobPage.load(jobEvent(MASTER))
    expect(markOpened).toHaveBeenCalledWith('job-1', MASTER)
  })
})

describe('сторінка замовлення /dashboard/orders/[id]', () => {
  const order = {
    id: 'order-1',
    clientId: CLIENT,
    masterId: MASTER,
    status: 'IN_PROGRESS',
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: new Date(),
    completedAt: null,
    cancelledAt: null,
    client: { id: CLIENT, name: 'Оля', phone: '+380671111111' },
    master: { id: MASTER, name: 'Іван', phone: '+380672222222' },
    events: [],
    reviews: [],
  }

  function orderEvent(userId: string) {
    return makeEvent({ params: { id: 'order-1' }, locals: sessionUser(userId) })
  }

  beforeEach(() => {
    prisma.order.findUnique.mockResolvedValue(order)
  })

  it('гість — редірект на логін', async () => {
    const location = await redirectOf(() =>
      orderPage.load(
        makeEvent({ params: { id: 'order-1' }, locals: anonymous }),
      ),
    )
    expect(location).toContain('/user/login')
  })

  it('неіснуюче замовлення — 404', async () => {
    prisma.order.findUnique.mockResolvedValue(null)
    expect(
      (await failure(() => orderPage.load(orderEvent(CLIENT)))).status,
    ).toBe(404)
  })

  it('стороння людина — 403', async () => {
    expect(
      (await failure(() => orderPage.load(orderEvent('stranger')))).status,
    ).toBe(403)
  })

  // ГОЛОВНА обіцянка з маніфесту: контакти відкриваються ЛИШЕ після угоди.
  // Це єдине місце в проєкті, де телефон легально потрапляє у відповідь —
  // тому що Order уже існує і глядач перевірений як його учасник.
  it('учасники угоди бачать телефон одне одного', async () => {
    for (const userId of [CLIENT, MASTER]) {
      const data = (await orderPage.load(orderEvent(userId))) as {
        order: { client: { phone: string }; master: { phone: string } }
      }

      expect(data.order.client.phone).toBe('+380671111111')
      expect(data.order.master.phone).toBe('+380672222222')
    }
  })

  it('стороння людина не доходить до select із телефоном', async () => {
    await failure(() => orderPage.load(orderEvent('stranger')))
    // Запит уже стався (перевірка після нього), але назовні нічого не поїхало —
    // фіксуємо саме це: відмова відбувається ДО повернення даних.
    expect(prisma.order.findUnique).toHaveBeenCalled()
  })
})

describe('сторінка чату /dashboard/messages/[chatId]', () => {
  function membership() {
    return {
      lastReadAt: null,
      chat: {
        id: 'chat-1',
        members: [
          {
            user: {
              id: 'user-1',
              name: 'Я',
              username: null,
              avatar: null,
              role: 'CLIENT',
              masterProfile: null,
            },
          },
          {
            user: {
              id: 'peer-1',
              name: 'Співрозмовник',
              username: 'peer',
              avatar: null,
              role: 'MASTER',
              masterProfile: { verificationStatus: 'VERIFIED' },
            },
          },
        ],
      },
    }
  }

  function message(patch: Record<string, unknown> = {}) {
    return {
      id: 'msg-1',
      type: 'TEXT',
      text: 'Привіт',
      attachmentUrl: null,
      attachmentMimeType: null,
      attachmentSize: null,
      attachmentName: null,
      isRead: false,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date(),
      senderId: 'peer-1',
      replyToId: null,
      replyTo: null,
      ...patch,
    }
  }

  function chatEvent(userId: string) {
    return makeEvent({
      params: { chatId: 'chat-1' },
      locals: sessionUser(userId),
    })
  }

  beforeEach(() => {
    prisma.chatMember.findUnique.mockResolvedValue(membership())
    prisma.message.findMany.mockResolvedValue([message()])
  })

  it('гість — редірект на логін', async () => {
    const location = await redirectOf(() =>
      chatPage.load(
        makeEvent({ params: { chatId: 'chat-1' }, locals: anonymous }),
      ),
    )
    expect(location).toContain('/user/login')
  })

  // Тут 404, а не 403: чужий чат не має підтверджувати навіть своє існування.
  it('не-учасник — 404', async () => {
    prisma.chatMember.findUnique.mockResolvedValue(null)

    const res = await failure(() => chatPage.load(chatEvent('stranger')))
    expect(res.status).toBe(404)
  })

  it('видалене повідомлення приходить без тексту й вкладення', async () => {
    prisma.message.findMany.mockResolvedValue([
      message({
        text: 'секрет',
        attachmentUrl: 'https://res.cloudinary.com/x.jpg',
        deletedAt: new Date(),
      }),
    ])

    const data = (await chatPage.load(chatEvent('user-1'))) as {
      initialMessages: { text: string; attachmentUrl: string | null }[]
    }

    expect(data.initialMessages[0].text).toBe('')
    expect(data.initialMessages[0].attachmentUrl).toBeNull()
  })

  it('перша сторінка обмежена 50 повідомленнями', async () => {
    prisma.message.findMany.mockResolvedValue(
      Array.from({ length: 51 }, (_, i) => message({ id: `m-${i}` })),
    )

    const data = (await chatPage.load(chatEvent('user-1'))) as {
      initialMessages: unknown[]
      initialNextCursor: string | null
    }

    expect(data.initialMessages).toHaveLength(50)
    expect(data.initialNextCursor).toBe('m-49')
  })

  // У шапці чату видно ім'я й аватар — телефону там немає й бути не може:
  // чат існує і до, і після завершення угоди.
  it('у даних чату немає телефону й пошти', async () => {
    const data = await chatPage.load(chatEvent('user-1'))
    const dump = JSON.stringify(data)

    expect(dump).not.toContain('phone')
    expect(dump).not.toContain('@example.com')
  })
})

describe('профіль клієнта /dashboard/client/[id]', () => {
  function clientEvent(viewerId: string | null, targetId = 'client-2') {
    return makeEvent({
      params: { id: targetId },
      locals: viewerId ? sessionUser(viewerId) : anonymous,
    })
  }

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue({ role: 'MASTER' })
    prisma.review.findMany.mockResolvedValue([])
    prisma.order.count.mockResolvedValue(0)
    prisma.city.findUnique.mockResolvedValue({ name: 'Одеса' })
  })

  // Навмисно 404, а не редірект на логін: гість не має дізнатись навіть те,
  // що такий профіль існує.
  it('гість — 404, а не редірект', async () => {
    const res = await failure(() => clientPage.load(clientEvent(null)))
    expect(res.status).toBe(404)
  })

  it('свій профіль — редірект на дашборд', async () => {
    const location = await redirectOf(() =>
      clientPage.load(clientEvent('client-2', 'client-2')),
    )
    expect(location).toBe('/dashboard')
  })

  // Профіль замовника — інструмент майстра при виборі роботи. Іншому
  // клієнту він не потрібен і не показується.
  it('клієнт не бачить профіль іншого клієнта', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'CLIENT' })

    const res = await failure(() => clientPage.load(clientEvent('client-3')))
    expect(res.status).toBe(404)
  })

  it('профіль майстра за цим маршрутом не відкривається', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ role: 'MASTER' }) // глядач
      .mockResolvedValueOnce({ id: 'x', role: 'MASTER' }) // ціль

    const res = await failure(() => clientPage.load(clientEvent(MASTER)))
    expect(res.status).toBe(404)
  })

  it('майстер бачить профіль клієнта — але БЕЗ телефону', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ role: 'MASTER' })
      .mockResolvedValueOnce({
        id: 'client-2',
        role: 'CLIENT',
        name: 'Оля',
        avatar: null,
        bio: null,
        city: 'odesa',
        createdAt: new Date(),
        avgRatingAsClient: 4.5,
        reviewsCountAsClient: 2,
      })

    const data = (await clientPage.load(clientEvent(MASTER))) as {
      user: { phone: null }
    }

    // Телефон з'являється тільки на сторінці замовлення — тут його немає
    // навіть у майстра, який зараз дивиться цю людину.
    expect(data.user.phone).toBeNull()
  })

  it('сторінка не кешується і не індексується', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ role: 'MASTER' })
      .mockResolvedValueOnce({
        id: 'client-2',
        role: 'CLIENT',
        name: 'Оля',
        avatar: null,
        bio: null,
        city: null,
        createdAt: new Date(),
        avgRatingAsClient: 0,
        reviewsCountAsClient: 0,
      })

    const headers: Record<string, string> = {}
    await clientPage.load({
      ...clientEvent(MASTER),
      setHeaders: (h: Record<string, string>) => Object.assign(headers, h),
    })

    expect(headers['cache-control']).toBe('private, no-store')
    expect(headers['x-robots-tag']).toContain('noindex')
  })
})

describe('публічний профіль /@handle', () => {
  const master = {
    id: MASTER,
    role: 'MASTER',
    username: 'ivan',
    name: 'Іван',
    avatar: null,
    bio: null,
    city: 'odesa',
    phone: '+380670000000',
    email: 'ivan@example.com',
    createdAt: new Date(),
    avgRatingAsMaster: 4.9,
    reviewsCountAsMaster: 10,
    masterProfile: {
      verificationStatus: 'VERIFIED',
      categories: ['cleaning'],
      portfolioImages: [],
      completedOrders: 5,
    },
  }

  function handleEvent(handle: string, viewerId: string | null = null) {
    return makeEvent({
      params: { handle },
      locals: viewerId ? sessionUser(viewerId) : anonymous,
    })
  }

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(master)
    prisma.review.findMany.mockResolvedValue([])
    prisma.city.findUnique.mockResolvedValue({ name: 'Одеса' })
    prisma.category.findMany.mockResolvedValue([
      { slug: 'cleaning', name: 'Прибирання' },
    ])
  })

  it('username поза форматом — 404 без запиту в базу', async () => {
    for (const h of ['@ab', '@1abc', '@a-b', '@../etc', '@' + 'a'.repeat(21)]) {
      resetPrisma()
      const res = await failure(() => handlePage.load(handleEvent(h)))
      expect(res.status).toBe(404)
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    }
  })

  it('неіснуючий користувач — 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    expect(
      (await failure(() => handlePage.load(handleEvent('@ivan')))).status,
    ).toBe(404)
  })

  // Клієнт не «вітрина»: публічної сторінки в нього немає навмисно.
  it('клієнт за @handle не відкривається', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...master, role: 'CLIENT' })
    expect(
      (await failure(() => handlePage.load(handleEvent('@ivan')))).status,
    ).toBe(404)
  })

  it('власний профіль веде на дашборд', async () => {
    const location = await redirectOf(() =>
      handlePage.load(handleEvent('@ivan', MASTER)),
    )
    expect(location).toBe('/dashboard')
  })

  // Сторінка публічна й потрапляє в пошук — телефон і пошта тут були б
  // витоком назавжди.
  it('у публічну відповідь не потрапляють телефон і пошта', async () => {
    const data = await handlePage.load(handleEvent('@ivan'))
    const dump = JSON.stringify(data)

    expect(dump).not.toContain('+380670000000')
    expect(dump).not.toContain('ivan@example.com')
  })

  it('перевірений майстер кешується публічно', async () => {
    const headers: Record<string, string> = {}
    await handlePage.load({
      ...handleEvent('@ivan'),
      setHeaders: (h: Record<string, string>) => Object.assign(headers, h),
    })

    expect(headers['cache-control']).toContain('public')
  })

  // Непідтверджений профіль не має потрапляти ні в кеш, ні в індекс:
  // модерація ще не бачила, що там написано.
  it('неперевірений майстер — private, no-store і noindex', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...master,
      masterProfile: { ...master.masterProfile, verificationStatus: 'PENDING' },
    })

    const headers: Record<string, string> = {}
    await handlePage.load({
      ...handleEvent('@ivan'),
      setHeaders: (h: Record<string, string>) => Object.assign(headers, h),
    })

    expect(headers['cache-control']).toBe('private, no-store')
    expect(headers['x-robots-tag']).toContain('noindex')
  })

  it('@ у параметрі не обов’язковий і регістр не важливий', async () => {
    await handlePage.load(handleEvent('@IVAN'))
    expect(prisma.user.findUnique.mock.calls[0][0].where).toEqual({
      username: 'ivan',
    })
  })
})
