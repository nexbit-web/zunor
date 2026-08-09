import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { Notify, safeTrigger, dispatchJob, resetInfra } from '../helpers/infra'
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
vi.mock('$lib/server/pusher', async () => await import('../helpers/infra'))
vi.mock(
  '$lib/server/notifications',
  async () => await import('../helpers/infra'),
)
vi.mock('$lib/server/dispatch', async () => await import('../helpers/infra'))

const { POST } = await import('../../routes/api/orders/[id]/[action]/+server')

// Тут рухається гроший бік угоди: «почато», «завершено», «скасовано». Роут —
// єдине місце, де стейт-машина зустрічається з правами, і перевіряти треба
// саме стик: не «START веде в IN_PROGRESS» (це вже покрито юнітом машини), а
// «клієнт не може закрити роботу за майстра».

const CLIENT = 'client-1'
const MASTER = 'master-1'

function order(patch: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    status: 'CREATED',
    clientId: CLIENT,
    masterId: MASTER,
    chatId: 'chat-1',
    fromJob: { id: 'job-1', title: 'Прибирання' },
    ...patch,
  }
}

function actionEvent(userId: string, action: string, body: unknown = {}) {
  return makeEvent({
    params: { id: 'order-1', action },
    locals: sessionUser(userId),
    body,
  })
}

beforeEach(() => {
  resetPrisma()
  resetInfra()
  prisma.order.findUnique.mockResolvedValue(order())
  prisma.order.update.mockResolvedValue({
    id: 'order-1',
    status: 'IN_PROGRESS',
    priceCents: 80_000,
    currency: 'UAH',
    title: 'Прибирання',
    clientId: CLIENT,
    masterId: MASTER,
    startedAt: new Date(),
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    chatId: 'chat-1',
  })
})

describe('доступ', () => {
  it('гість — 401', async () => {
    const res = await failure(() =>
      POST(
        makeEvent({
          params: { id: 'order-1', action: 'start' },
          locals: anonymous,
          body: {},
        }),
      ),
    )
    expect(res.status).toBe(401)
  })

  it('невідома дія — 400, до бази навіть не йдемо', async () => {
    const res = await failure(() => POST(actionEvent(MASTER, 'refund')))
    expect(res.status).toBe(400)
    expect(prisma.order.findUnique).not.toHaveBeenCalled()
  })

  it('неіснуюче замовлення — 404', async () => {
    prisma.order.findUnique.mockResolvedValue(null)
    expect(
      (await failure(() => POST(actionEvent(MASTER, 'start')))).status,
    ).toBe(404)
  })

  // Стороння людина не має рухати чужу угоду навіть у дозволений стан.
  it('не-учасник — 403', async () => {
    const res = await failure(() => POST(actionEvent('stranger', 'start')))
    expect(res.status).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('права на переходи', () => {
  it('клієнт не починає роботу за майстра', async () => {
    const res = await failure(() => POST(actionEvent(CLIENT, 'start')))
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('клієнт не завершує роботу за майстра', async () => {
    prisma.order.findUnique.mockResolvedValue(order({ status: 'IN_PROGRESS' }))
    expect(
      (await failure(() => POST(actionEvent(CLIENT, 'complete')))).status,
    ).toBe(400)
  })

  it('завершити нерозпочате не можна', async () => {
    expect(
      (await failure(() => POST(actionEvent(MASTER, 'complete')))).status,
    ).toBe(400)
  })

  it('термінальний стан не рухається нікуди', async () => {
    prisma.order.findUnique.mockResolvedValue(order({ status: 'COMPLETED' }))
    for (const action of ['start', 'complete', 'cancel']) {
      expect(
        (await failure(() => POST(actionEvent(MASTER, action)))).status,
      ).toBe(400)
    }
  })
})

describe('START', () => {
  it('майстер починає роботу: статус, лічильник, сповіщення, broadcast', async () => {
    const body = await okJson<{ order: { status: string } }>(() =>
      POST(actionEvent(MASTER, 'start')),
    )

    expect(body.order.status).toBe('IN_PROGRESS')
    expect(prisma.masterProfile.update).toHaveBeenCalledWith({
      where: { userId: MASTER },
      data: { totalOrders: { increment: 1 } },
    })
    expect(Notify.orderStarted).toHaveBeenCalledWith(CLIENT, 'order-1')
    // Плашка в шапці чату оновлюється подією, а не системним повідомленням:
    // інакше кожна зміна статусу накручувала б лічильник непрочитаних.
    expect(safeTrigger).toHaveBeenCalledWith(
      'private-chat-chat-1',
      'order:status',
      { orderId: 'order-1', status: 'IN_PROGRESS' },
    )
    expect(prisma.message.create).not.toHaveBeenCalled()
  })

  it('перехід і аудит — в одній транзакції', async () => {
    await POST(actionEvent(MASTER, 'start'))
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.orderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        type: 'STARTED',
        actorId: MASTER,
      }),
    })
  })
})

describe('COMPLETE', () => {
  it('майстер завершує: лічильник виконаних і сповіщення клієнту', async () => {
    prisma.order.findUnique.mockResolvedValue(order({ status: 'IN_PROGRESS' }))
    prisma.order.update.mockResolvedValue({
      id: 'order-1',
      status: 'COMPLETED',
      clientId: CLIENT,
      masterId: MASTER,
      chatId: 'chat-1',
      cancelReason: null,
    })

    await POST(actionEvent(MASTER, 'complete'))

    expect(prisma.masterProfile.update).toHaveBeenCalledWith({
      where: { userId: MASTER },
      data: { completedOrders: { increment: 1 } },
    })
    expect(Notify.orderCompleted).toHaveBeenCalledWith(CLIENT, 'order-1')
  })
})

describe('CANCEL', () => {
  beforeEach(() => {
    prisma.order.update.mockResolvedValue({
      id: 'order-1',
      status: 'CANCELLED',
      clientId: CLIENT,
      masterId: MASTER,
      chatId: 'chat-1',
      cancelReason: null,
    })
  })

  it('клієнт скасовує — майстер отримує сповіщення', async () => {
    await POST(actionEvent(CLIENT, 'cancel', { reason: 'Передумав' }))

    expect(Notify.orderCancelled).toHaveBeenCalled()
    expect(Notify.jobReopened).not.toHaveBeenCalled()
    // Заявку назад у пошук клієнтське скасування НЕ повертає.
    expect(prisma.job.update).not.toHaveBeenCalled()
  })

  it('занадто довга причина — 400', async () => {
    const res = await failure(() =>
      POST(actionEvent(CLIENT, 'cancel', { reason: 'я'.repeat(501) })),
    )
    expect(res.status).toBe(400)
  })

  // Обіцянка з маніфесту: майстер відмовився — клієнт не винен, заявка
  // повертається в пошук чистою, а втікач отримує чорну мітку.
  it('майстер відмовився — заявка повертається в пошук', async () => {
    await POST(actionEvent(MASTER, 'cancel', { reason: 'Захворів' }))

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        status: 'OPEN',
        closedAt: null,
        selectedOrderId: null,
        proposalsCount: 0,
      },
    })
    expect(prisma.proposal.deleteMany).toHaveBeenCalledWith({
      where: { jobId: 'job-1' },
    })
  })

  it('втікач отримує чорну мітку, решта майстрів — чистий старт', async () => {
    await POST(actionEvent(MASTER, 'cancel'))

    expect(prisma.dispatchEvent.updateMany).toHaveBeenCalledWith({
      where: { jobId: 'job-1', masterId: MASTER },
      data: { declined: true, respondedAt: null, openedAt: null },
    })
    expect(prisma.dispatchEvent.deleteMany).toHaveBeenCalledWith({
      where: { jobId: 'job-1', masterId: { not: MASTER }, declined: false },
    })
  })

  it('після відмови майстра диспетчер шукає заміну, клієнту — тепле сповіщення', async () => {
    await POST(actionEvent(MASTER, 'cancel'))

    expect(dispatchJob).toHaveBeenCalledWith('job-1', 'Прибирання')
    expect(Notify.jobReopened).toHaveBeenCalledWith(CLIENT, 'job-1')
    expect(Notify.orderCancelled).not.toHaveBeenCalled()
  })

  it('замовлення без заявки не намагається нічого перевідкривати', async () => {
    prisma.order.findUnique.mockResolvedValue(order({ fromJob: null }))

    await POST(actionEvent(MASTER, 'cancel'))

    expect(prisma.job.update).not.toHaveBeenCalled()
    expect(dispatchJob).not.toHaveBeenCalled()
    expect(Notify.orderCancelled).toHaveBeenCalled()
  })
})

describe('стійкість', () => {
  // Pusher і сповіщення — не критичний шлях. Якщо вони впали, статус уже
  // змінено в базі, і відповідь має бути успішною.
  it('збій сповіщення не скасовує вже зроблений перехід', async () => {
    Notify.orderStarted.mockRejectedValueOnce(new Error('smtp down'))

    const res = (await POST(actionEvent(MASTER, 'start'))) as Response
    expect(res.status).toBe(200)
  })
})
