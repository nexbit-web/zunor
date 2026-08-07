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

const { GET, DELETE } = await import('../../routes/api/proposals/[id]/+server')

// Відгук бачать рівно двоє: майстер-автор і власник заявки. Для всіх інших
// це чужа комерційна пропозиція з ціною — тобто рівно те, за чим полював би
// конкурент.

const MASTER = 'master-1'
const CLIENT = 'client-1'

function proposal(patch: Record<string, unknown> = {}) {
  return {
    id: 'prop-1',
    jobId: 'job-1',
    masterId: MASTER,
    message: 'Зроблю якісно',
    priceCents: 80_000,
    estimatedDays: 1,
    status: 'SENT',
    createdAt: new Date(),
    master: {
      id: MASTER,
      name: 'Іван',
      username: 'ivan',
      avatar: null,
      city: 'odesa',
      avgRatingAsMaster: 4.7,
      reviewsCountAsMaster: 9,
      masterProfile: { verificationStatus: 'VERIFIED', completedOrders: 20 },
    },
    job: { id: 'job-1', title: 'Прибирання', clientId: CLIENT, status: 'OPEN' },
    ...patch,
  }
}

function propEvent(userId: string) {
  return makeEvent({ params: { id: 'prop-1' }, locals: sessionUser(userId) })
}

beforeEach(() => {
  resetPrisma()
  prisma.proposal.findUnique.mockResolvedValue(proposal())
})

describe('GET — перегляд відгуку', () => {
  it('гість — 401', async () => {
    const res = await failure(() =>
      GET(makeEvent({ params: { id: 'prop-1' }, locals: anonymous })),
    )
    expect(res.status).toBe(401)
  })

  it('неіснуючий відгук — 404', async () => {
    prisma.proposal.findUnique.mockResolvedValue(null)
    expect((await failure(() => GET(propEvent(CLIENT)))).status).toBe(404)
  })

  // Ціна конкурента — комерційна таємниця майстра.
  it('стороння людина не бачить чужу пропозицію з ціною', async () => {
    const res = await failure(() => GET(propEvent('stranger')))
    expect(res.status).toBe(403)
  })

  it('інший майстер теж не бачить', async () => {
    const res = await failure(() => GET(propEvent('master-2')))
    expect(res.status).toBe(403)
  })

  it('автор і власник заявки бачать', async () => {
    for (const userId of [MASTER, CLIENT]) {
      const body = await okJson<{ proposal: { id: string } }>(() =>
        GET(propEvent(userId)),
      )
      expect(body.proposal.id).toBe('prop-1')
    }
  })

  it('рейтинг майстра — плоский, телефону немає', async () => {
    const body = await okJson<{
      proposal: { master: Record<string, unknown> }
    }>(() => GET(propEvent(CLIENT)))

    expect(body.proposal.master.avgRating).toBe(4.7)
    expect(body.proposal.master).not.toHaveProperty('avgRatingAsMaster')
    expect(body.proposal.master).not.toHaveProperty('phone')
  })
})

describe('DELETE — відкликати відгук', () => {
  beforeEach(() => {
    prisma.proposal.findUnique.mockResolvedValue({
      id: 'prop-1',
      masterId: MASTER,
      jobId: 'job-1',
      status: 'SENT',
    })
  })

  it('гість — 401', async () => {
    const res = await failure(() =>
      DELETE(makeEvent({ params: { id: 'prop-1' }, locals: anonymous })),
    )
    expect(res.status).toBe(401)
  })

  // Клієнт не може «прибрати» невигідний відгук за майстра — це його слово.
  it('власник заявки не може відкликати чужий відгук', async () => {
    const res = await failure(() => DELETE(propEvent(CLIENT)))
    expect(res.status).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('чужий майстер не може відкликати', async () => {
    expect((await failure(() => DELETE(propEvent('master-2')))).status).toBe(
      403,
    )
  })

  it('вже прийнятий відгук не відкликається', async () => {
    for (const status of ['ACCEPTED', 'REJECTED', 'WITHDRAWN']) {
      resetPrisma()
      prisma.proposal.findUnique.mockResolvedValue({
        id: 'prop-1',
        masterId: MASTER,
        jobId: 'job-1',
        status,
      })

      const res = await failure(() => DELETE(propEvent(MASTER)))
      expect(res.status).toBe(400)
      expect(prisma.proposal.update).not.toHaveBeenCalled()
    }
  })

  // Статус і лічильник — в одній транзакції: інакше proposalsCount
  // розходиться з реальністю, а на нього спирається зупинка розсилки.
  it('автор відкликає: статус WITHDRAWN і лічильник заявки вниз', async () => {
    const body = await okJson<{ ok: boolean }>(() => DELETE(propEvent(MASTER)))

    expect(body.ok).toBe(true)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)

    const data = prisma.proposal.update.mock.calls[0][0].data
    expect(data.status).toBe('WITHDRAWN')
    expect(data.withdrawnAt).toBeInstanceOf(Date)

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { proposalsCount: { decrement: 1 } },
    })
  })

  // М'яке відкликання, а не видалення: історія відгуків потрібна скорингу.
  it('рядок не видаляється фізично', async () => {
    await DELETE(propEvent(MASTER))
    expect(prisma.proposal.delete).not.toHaveBeenCalled()
    expect(prisma.proposal.deleteMany).not.toHaveBeenCalled()
  })
})
