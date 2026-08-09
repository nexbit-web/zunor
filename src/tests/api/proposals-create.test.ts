import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { Notify, markResponded, resetInfra } from '../helpers/infra'
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
vi.mock(
  '$lib/server/notifications',
  async () => await import('../helpers/infra'),
)
vi.mock('$lib/server/dispatch', async () => await import('../helpers/infra'))

const { POST, GET } =
  await import('../../routes/api/jobs/[id]/proposals/+server')

// Відгук — точка, де майстер уперше торкається чужої заявки. Право на відгук
// перевіряється на сервері тією ж умовою, що й у стрічці: UI ховає кнопку,
// але кнопка — не захист.

const master = {
  role: 'MASTER',
  city: 'odesa',
  masterProfile: { isActive: true, categories: ['cleaning'] },
}

const openJob = {
  id: 'job-1',
  clientId: 'client-1',
  status: 'OPEN',
  expiresAt: new Date(Date.now() + 86_400_000),
  title: 'Прибирання',
  category: 'cleaning',
  city: 'odesa',
}

const validBody = {
  message: 'Доброго дня! Зроблю якісно, маю досвід роботи з такими квартирами.',
  priceUah: 800,
  estimatedDays: 1,
}

function postEvent(userId: string, body: unknown = validBody) {
  return makeEvent({
    params: { id: 'job-1' },
    locals: sessionUser(userId),
    body,
  })
}

beforeEach(() => {
  resetPrisma()
  resetInfra()
  prisma.user.findUnique.mockResolvedValue(master)
  prisma.job.findUnique.mockResolvedValue(openJob)
  prisma.proposal.findUnique.mockResolvedValue(null)
  prisma.proposal.create.mockResolvedValue({
    id: 'prop-1',
    message: validBody.message,
    priceCents: 80_000,
    estimatedDays: 1,
    status: 'SENT',
    createdAt: new Date(),
  })
})

describe('хто може відгукуватись', () => {
  it('гість — 401', async () => {
    const res = await failure(() =>
      POST(
        makeEvent({
          params: { id: 'job-1' },
          locals: anonymous,
          body: validBody,
        }),
      ),
    )
    expect(res.status).toBe(401)
  })

  it('клієнт — 403', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...master, role: 'CLIENT' })
    expect((await failure(() => POST(postEvent('c1')))).status).toBe(403)
  })

  it('майстер із вимкненим профілем — 403', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...master,
      masterProfile: { isActive: false, categories: ['cleaning'] },
    })
    expect((await failure(() => POST(postEvent('m1')))).status).toBe(403)
  })

  it('майстер з іншого міста — 403', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...master, city: 'kyiv' })
    expect((await failure(() => POST(postEvent('m1')))).status).toBe(403)
  })

  it('майстер з іншою категорією — 403', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...master,
      masterProfile: { isActive: true, categories: ['repair'] },
    })
    expect((await failure(() => POST(postEvent('m1')))).status).toBe(403)
  })

  it('на власну заявку відгукнутись не можна', async () => {
    expect((await failure(() => POST(postEvent('client-1')))).status).toBe(400)
  })

  it('повторний відгук на ту саму заявку — 400', async () => {
    prisma.proposal.findUnique.mockResolvedValue({ id: 'prop-old' })
    expect((await failure(() => POST(postEvent('m1')))).status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('стан заявки', () => {
  it('на закриту заявку відгукнутись не можна', async () => {
    prisma.job.findUnique.mockResolvedValue({
      ...openJob,
      status: 'IN_PROGRESS',
    })
    expect((await failure(() => POST(postEvent('m1')))).status).toBe(400)
  })

  it('прострочену заявку сервер відхиляє сам', async () => {
    prisma.job.findUnique.mockResolvedValue({
      ...openJob,
      expiresAt: new Date(Date.now() - 1000),
    })
    expect((await failure(() => POST(postEvent('m1')))).status).toBe(400)
  })

  it('неіснуюча заявка — 404', async () => {
    prisma.job.findUnique.mockResolvedValue(null)
    expect((await failure(() => POST(postEvent('m1')))).status).toBe(404)
  })
})

describe('валідація тіла', () => {
  const badBodies: [string, unknown][] = [
    ['порожнє повідомлення', { ...validBody, message: '' }],
    ['занадто коротке повідомлення', { ...validBody, message: 'Зроблю' }],
    ['повідомлення понад 2000', { ...validBody, message: 'я'.repeat(2001) }],
    ['ціна нуль', { ...validBody, priceUah: 0 }],
    ['ціна відʼємна', { ...validBody, priceUah: -100 }],
    ['ціна нижче мінімуму', { ...validBody, priceUah: 10 }],
    ['ціна поза стелею', { ...validBody, priceUah: 10_000_000 }],
    ['ціна не число', { ...validBody, priceUah: 'дешево' }],
    ['термін нуль днів', { ...validBody, estimatedDays: 0 }],
    ['термін понад 180 днів', { ...validBody, estimatedDays: 365 }],
    ['дробовий термін', { ...validBody, estimatedDays: 1.5 }],
  ]

  for (const [label, body] of badBodies) {
    it(`${label} → 400`, async () => {
      const res = await failure(() => POST(postEvent('m1', body)))
      expect(res.status).toBe(400)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  }

  it('зламаний JSON → 400, а не 500', async () => {
    const res = await failure(() =>
      POST(
        makeEvent({
          params: { id: 'job-1' },
          locals: sessionUser('m1'),
          body: '{ це не json',
        }),
      ),
    )
    expect(res.status).toBe(400)
  })
})

describe('успішний відгук', () => {
  it('створює пропозицію, рахує лічильник і сповіщає клієнта', async () => {
    const res = (await POST(postEvent('m1'))) as Response
    expect(res.status).toBe(201)

    // Створення відгуку й інкремент лічильника — в одній транзакції:
    // інакше proposalsCount розходиться з реальністю при збої.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { proposalsCount: { increment: 1 } },
    })
    expect(Notify.newProposal).toHaveBeenCalledWith(
      'client-1',
      'job-1',
      'prop-1',
    )
    expect(markResponded).toHaveBeenCalledWith('job-1', 'm1')
  })

  it('ціна конвертується в копійки', async () => {
    await POST(postEvent('m1', { ...validBody, priceUah: 1234.56 }))

    const data = prisma.proposal.create.mock.calls[0][0].data
    expect(data.priceCents).toBe(123_456)
  })

  // Сповіщення — не критичний шлях: збій пошти/Pusher не має скасовувати
  // вже створений відгук.
  it('збій сповіщення не валить відгук', async () => {
    Notify.newProposal.mockRejectedValueOnce(new Error('pusher down'))

    const res = (await POST(postEvent('m1'))) as Response
    expect(res.status).toBe(201)
  })
})

describe('GET — список відгуків', () => {
  it('бачить лише власник заявки', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      clientId: 'client-1',
    })

    const res = await failure(() =>
      GET(
        makeEvent({ params: { id: 'job-1' }, locals: sessionUser('stranger') }),
      ),
    )
    expect(res.status).toBe(403)
    expect(prisma.proposal.findMany).not.toHaveBeenCalled()
  })

  it('власник отримує список із плоским рейтингом майстра', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      clientId: 'client-1',
    })
    prisma.proposal.findMany.mockResolvedValue([
      {
        id: 'p1',
        message: 'текст',
        priceCents: 80_000,
        estimatedDays: 1,
        status: 'SENT',
        createdAt: new Date(),
        master: {
          id: 'm1',
          name: 'Іван',
          username: 'ivan',
          avatar: null,
          city: 'odesa',
          avgRatingAsMaster: 4.9,
          reviewsCountAsMaster: 12,
          masterProfile: {
            verificationStatus: 'VERIFIED',
            completedOrders: 30,
          },
        },
      },
    ])

    const body = await okJson<{
      proposals: { master: Record<string, unknown> }[]
    }>(() =>
      GET(
        makeEvent({ params: { id: 'job-1' }, locals: sessionUser('client-1') }),
      ),
    )

    expect(body.proposals[0].master.avgRating).toBe(4.9)
    // Телефон майстра до угоди клієнту не показують — його немає в select.
    expect(body.proposals[0].master).not.toHaveProperty('phone')
  })
})
