import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { Notify, cancelWaves, resetInfra } from '../helpers/infra'
import { makeEvent, sessionUser, anonymous, failure } from '../helpers/event'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))
vi.mock(
  '$lib/server/notifications',
  async () => await import('../helpers/infra'),
)
vi.mock(
  '$lib/server/dispatch/scheduler',
  async () => await import('../helpers/infra'),
)

const { POST } = await import('../../routes/api/proposals/[id]/accept/+server')

// Вибір майстра — момент, коли заявка стає угодою. Тут одночасно: створення
// Order, закриття заявки, відхилення решти відгуків і зняття хвиль. Якщо
// щось із цього виконається наполовину, дані розійдуться назавжди — тому
// перевіряємо і права, і атомарність.

const CLIENT = 'client-1'

function proposal(patch: Record<string, unknown> = {}) {
  return {
    id: 'prop-1',
    jobId: 'job-1',
    masterId: 'master-1',
    message: 'текст',
    priceCents: 80_000,
    estimatedDays: 1,
    status: 'SENT',
    job: {
      id: 'job-1',
      title: 'Прибирання',
      description: 'опис',
      metadata: { premise: 'apartment' },
      clientId: CLIENT,
      status: 'OPEN',
    },
    ...patch,
  }
}

function acceptEvent(userId: string) {
  return makeEvent({ params: { id: 'prop-1' }, locals: sessionUser(userId) })
}

beforeEach(() => {
  resetPrisma()
  resetInfra()
  prisma.proposal.findUnique.mockResolvedValue(proposal())
  prisma.order.create.mockResolvedValue({
    id: 'order-1',
    title: 'Прибирання',
    priceCents: 80_000,
    currency: 'UAH',
    status: 'CREATED',
    chatId: null,
    clientId: CLIENT,
    masterId: 'master-1',
  })
})

describe('права', () => {
  it('гість — 401', async () => {
    const res = await failure(() =>
      POST(makeEvent({ params: { id: 'prop-1' }, locals: anonymous })),
    )
    expect(res.status).toBe(401)
  })

  it('неіснуючий відгук — 404', async () => {
    prisma.proposal.findUnique.mockResolvedValue(null)
    expect((await failure(() => POST(acceptEvent(CLIENT)))).status).toBe(404)
  })

  // Найнебезпечніший сценарій: чужа людина обирає майстра на чужу заявку
  // і створює угоду від імені власника.
  it('не-власник заявки не може обрати майстра', async () => {
    const res = await failure(() => POST(acceptEvent('stranger')))
    expect(res.status).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.order.create).not.toHaveBeenCalled()
  })

  it('майстер не може прийняти власний відгук', async () => {
    expect((await failure(() => POST(acceptEvent('master-1')))).status).toBe(
      403,
    )
  })
})

describe('стан', () => {
  it('на закритій заявці вибір неможливий', async () => {
    prisma.proposal.findUnique.mockResolvedValue(
      proposal({ job: { ...proposal().job, status: 'IN_PROGRESS' } }),
    )
    expect((await failure(() => POST(acceptEvent(CLIENT)))).status).toBe(400)
  })

  // Захист від подвійного кліку й від гонки: другий виклик не створить
  // другого замовлення на ту саму заявку.
  it('вже прийнятий або відхилений відгук повторно не приймається', async () => {
    for (const status of ['ACCEPTED', 'REJECTED']) {
      resetPrisma()
      prisma.proposal.findUnique.mockResolvedValue(proposal({ status }))
      const res = await failure(() => POST(acceptEvent(CLIENT)))
      expect(res.status).toBe(400)
      expect(prisma.order.create).not.toHaveBeenCalled()
    }
  })
})

describe('успішний вибір', () => {
  it('повертає 201 і створене замовлення', async () => {
    const res = (await POST(acceptEvent(CLIENT))) as Response
    expect(res.status).toBe(201)
  })

  it('усе змінюється в одній транзакції', async () => {
    await POST(acceptEvent(CLIENT))
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('обраний відгук — ACCEPTED, решта — REJECTED', async () => {
    await POST(acceptEvent(CLIENT))

    expect(prisma.proposal.update).toHaveBeenCalledWith({
      where: { id: 'prop-1' },
      data: { status: 'ACCEPTED' },
    })
    expect(prisma.proposal.updateMany).toHaveBeenCalledWith({
      where: { jobId: 'job-1', id: { not: 'prop-1' }, status: 'SENT' },
      data: { status: 'REJECTED' },
    })
  })

  it('заявка закривається і посилається на замовлення', async () => {
    await POST(acceptEvent(CLIENT))

    const data = prisma.job.update.mock.calls[0][0].data
    expect(data.status).toBe('IN_PROGRESS')
    expect(data.selectedOrderId).toBe('order-1')
  })

  // Чат навмисно не створюється: інакше кожен вибір майстра плодив би
  // порожній чат у обох списках повідомлень.
  it('чат не створюється разом із замовленням', async () => {
    await POST(acceptEvent(CLIENT))

    expect(prisma.chat.create).not.toHaveBeenCalled()
    expect(prisma.order.create.mock.calls[0][0].data.chatId).toBeUndefined()
  })

  // Заявка більше не приймає відгуки — таймери хвиль мають зникнути, інакше
  // вони прокинуться й розбудять базу заради закритої заявки.
  it('заплановані хвилі знімаються', async () => {
    await POST(acceptEvent(CLIENT))
    expect(cancelWaves).toHaveBeenCalledWith('job-1')
  })

  it('майстер отримує сповіщення', async () => {
    await POST(acceptEvent(CLIENT))
    expect(Notify.proposalAccepted).toHaveBeenCalledWith(
      'master-1',
      'job-1',
      'order-1',
    )
  })

  it('збій сповіщення не скасовує угоду', async () => {
    Notify.proposalAccepted.mockRejectedValueOnce(new Error('down'))
    const res = (await POST(acceptEvent(CLIENT))) as Response
    expect(res.status).toBe(201)
  })
})
