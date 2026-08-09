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

const { POST } = await import('../../routes/api/reviews/+server')

// Відгук — це репутація, тобто гроші майстра. Три речі мають триматись
// залізно: відгук лишає лише учасник, лише після завершення роботи й лише
// один раз. І пише він у ПРАВИЛЬНЕ поле рейтингу: одна людина може бути й
// замовником, і виконавцем, і репутації в цих ролях різні.

const CLIENT = 'client-1'
const MASTER = 'master-1'

function completedOrder(patch: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    status: 'COMPLETED',
    clientId: CLIENT,
    masterId: MASTER,
    ...patch,
  }
}

function reviewEvent(userId: string, body: unknown) {
  return makeEvent({ locals: sessionUser(userId), body })
}

const validBody = { orderId: 'order-1', rating: 5, comment: 'Чудова робота' }

beforeEach(() => {
  resetPrisma()
  prisma.order.findUnique.mockResolvedValue(completedOrder())
  prisma.review.findUnique.mockResolvedValue(null)
  prisma.review.aggregate.mockResolvedValue({
    _avg: { rating: 4.5 },
    _count: { _all: 2 },
  })
})

describe('доступ', () => {
  it('гість — 401', async () => {
    const res = await failure(() =>
      POST(makeEvent({ locals: anonymous, body: validBody })),
    )
    expect(res.status).toBe(401)
  })

  it('не-учасник замовлення — 403', async () => {
    const res = await failure(() => POST(reviewEvent('stranger', validBody)))
    expect(res.status).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('неіснуюче замовлення — 404', async () => {
    prisma.order.findUnique.mockResolvedValue(null)
    expect(
      (await failure(() => POST(reviewEvent(CLIENT, validBody)))).status,
    ).toBe(404)
  })

  // Відгук до завершення роботи — це важіль тиску на виконавця.
  it('до завершення роботи відгук залишити не можна', async () => {
    for (const status of ['CREATED', 'IN_PROGRESS', 'CANCELLED']) {
      prisma.order.findUnique.mockResolvedValue(completedOrder({ status }))
      const res = await failure(() => POST(reviewEvent(CLIENT, validBody)))
      expect(res.status).toBe(400)
    }
  })

  it('другий відгук тієї ж сторони — 409', async () => {
    prisma.review.findUnique.mockResolvedValue({ id: 'rev-1' })
    const res = await failure(() => POST(reviewEvent(CLIENT, validBody)))
    expect(res.status).toBe(409)
    expect(prisma.review.create).not.toHaveBeenCalled()
  })
})

describe('валідація', () => {
  const bad: [string, unknown][] = [
    ['без orderId', { rating: 5 }],
    ['рейтинг 0', { orderId: 'order-1', rating: 0 }],
    ['рейтинг 6', { orderId: 'order-1', rating: 6 }],
    ['рейтинг відʼємний', { orderId: 'order-1', rating: -5 }],
    ['рейтинг дробовий', { orderId: 'order-1', rating: 4.5 }],
    ['рейтинг рядком', { orderId: 'order-1', rating: 'пʼять' }],
    [
      'коментар понад 2000',
      { orderId: 'order-1', rating: 5, comment: 'я'.repeat(2001) },
    ],
  ]

  for (const [label, body] of bad) {
    it(`${label} → 400`, async () => {
      const res = await failure(() => POST(reviewEvent(CLIENT, body)))
      expect(res.status).toBe(400)
    })
  }

  it('порожній коментар зберігається як null, а не порожній рядок', async () => {
    await POST(
      reviewEvent(CLIENT, { orderId: 'order-1', rating: 5, comment: '   ' }),
    )
    expect(prisma.review.create.mock.calls[0][0].data.comment).toBeNull()
  })
})

describe('напрямок відгуку', () => {
  // Регресія, яку типи не ловлять: рейтинг роздвоєний на *AsMaster /
  // *AsClient, і запис не в те поле тихо псує репутацію не тій стороні.
  it('відгук клієнта підіймає рейтинг МАЙСТРА', async () => {
    const body = await okJson<{ ok: boolean }>(() =>
      POST(reviewEvent(CLIENT, validBody)),
    )

    expect(body.ok).toBe(true)
    expect(prisma.review.create.mock.calls[0][0].data.direction).toBe(
      'CLIENT_TO_MASTER',
    )
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: MASTER },
      data: { avgRatingAsMaster: 4.5, reviewsCountAsMaster: 2 },
    })
  })

  it('відгук майстра підіймає рейтинг КЛІЄНТА', async () => {
    await POST(reviewEvent(MASTER, validBody))

    expect(prisma.review.create.mock.calls[0][0].data.direction).toBe(
      'MASTER_TO_CLIENT',
    )
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: CLIENT },
      data: { avgRatingAsClient: 4.5, reviewsCountAsClient: 2 },
    })
  })

  it('автором записується той, хто пише, а не той, кого оцінюють', async () => {
    await POST(reviewEvent(CLIENT, validBody))
    expect(prisma.review.create.mock.calls[0][0].data.authorId).toBe(CLIENT)
  })

  it('відгук і перерахунок рейтингу — одна транзакція', async () => {
    await POST(reviewEvent(CLIENT, validBody))
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('перший відгук без середнього не обнуляє рейтинг у NaN', async () => {
    prisma.review.aggregate.mockResolvedValue({
      _avg: { rating: null },
      _count: { _all: 0 },
    })

    await POST(reviewEvent(CLIENT, validBody))
    expect(prisma.user.update.mock.calls[0][0].data.avgRatingAsMaster).toBe(0)
  })
})
