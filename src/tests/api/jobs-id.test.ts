import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { cancelWaves, resetInfra } from '../helpers/infra'
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
  '$lib/server/dispatch/scheduler',
  async () => await import('../helpers/infra'),
)

const { GET, DELETE } = await import('../../routes/api/jobs/[id]/+server')

// GET /api/jobs/[id] віддає заявку РАЗОМ із фото помешкання клієнта. Саме
// тут колись не було жодної перевірки, крім «залогінений», і ендпоінт роками
// віддавав чужі заявки з вкладеннями будь-якому акаунту. Ці тести — головна
// страховка від повторення.

/** Заявка-еталон, як її повертає prisma.job.findUnique у роуті. */
const job = {
  id: 'job-1',
  clientId: 'client-1',
  category: 'cleaning',
  city: 'odesa',
  title: 'Прибирання квартири',
  description: 'опис',
  attachments: ['https://res.cloudinary.com/test/photo.jpg'],
  status: 'OPEN',
  proposalsCount: 0,
  viewsCount: 0,
  expiresAt: new Date(),
  closedAt: null,
  createdAt: new Date(),
  budgetMinCents: null,
  budgetMaxCents: null,
  currency: 'UAH',
  client: {
    id: 'client-1',
    name: 'Оля',
    username: null,
    avatar: null,
    avgRatingAsClient: 5,
    reviewsCountAsClient: 2,
  },
}

/** Глядач, як його повертає prisma.user.findUnique із jobViewerSelect. */
function viewer(patch: Record<string, unknown> = {}) {
  return {
    role: 'MASTER',
    city: 'odesa',
    masterProfile: { isActive: true, categories: ['cleaning'] },
    ...patch,
  }
}

beforeEach(() => {
  resetPrisma()
  resetInfra()
})

describe('GET /api/jobs/[id]', () => {
  it('гість отримує 401, а не заявку', async () => {
    const res = await failure(() =>
      GET(makeEvent({ params: { id: 'job-1' }, locals: anonymous })),
    )
    expect(res.status).toBe(401)
  })

  it('неіснуюча заявка — 404', async () => {
    prisma.job.findUnique.mockResolvedValue(null)
    prisma.user.findUnique.mockResolvedValue(viewer())

    const res = await failure(() =>
      GET(
        makeEvent({ params: { id: 'nope' }, locals: sessionUser('master-1') }),
      ),
    )
    expect(res.status).toBe(404)
  })

  it('власник бачить свою заявку', async () => {
    prisma.job.findUnique.mockResolvedValue(job)
    prisma.user.findUnique.mockResolvedValue(viewer({ role: 'CLIENT' }))

    const body = await okJson<{
      job: { attachments: string[] }
      isOwner: boolean
    }>(() =>
      GET(
        makeEvent({ params: { id: 'job-1' }, locals: sessionUser('client-1') }),
      ),
    )

    expect(body.isOwner).toBe(true)
    expect(body.job.attachments).toHaveLength(1)
  })

  it('релевантний майстер бачить заявку, але не як власник', async () => {
    prisma.job.findUnique.mockResolvedValue(job)
    prisma.user.findUnique.mockResolvedValue(viewer())

    const body = await okJson<{ isOwner: boolean }>(() =>
      GET(
        makeEvent({ params: { id: 'job-1' }, locals: sessionUser('master-1') }),
      ),
    )

    expect(body.isOwner).toBe(false)
  })

  // Головний регресійний тест: чужий клієнт не має бачити фото чужої оселі.
  it('сторонній клієнт отримує 404 — і жодного фото', async () => {
    prisma.job.findUnique.mockResolvedValue(job)
    prisma.user.findUnique.mockResolvedValue(
      viewer({ role: 'CLIENT', masterProfile: null }),
    )

    const res = await failure(() =>
      GET(
        makeEvent({ params: { id: 'job-1' }, locals: sessionUser('stranger') }),
      ),
    )
    // Саме 404: 403 підтвердив би, що заявка з таким id існує.
    expect(res.status).toBe(404)
  })

  it('майстер з іншого міста отримує 404', async () => {
    prisma.job.findUnique.mockResolvedValue(job)
    prisma.user.findUnique.mockResolvedValue(viewer({ city: 'kyiv' }))

    const res = await failure(() =>
      GET(
        makeEvent({ params: { id: 'job-1' }, locals: sessionUser('master-2') }),
      ),
    )
    expect(res.status).toBe(404)
  })

  it('майстер із вимкненим профілем отримує 404', async () => {
    prisma.job.findUnique.mockResolvedValue(job)
    prisma.user.findUnique.mockResolvedValue(
      viewer({ masterProfile: { isActive: false, categories: ['cleaning'] } }),
    )

    const res = await failure(() =>
      GET(
        makeEvent({ params: { id: 'job-1' }, locals: sessionUser('master-3') }),
      ),
    )
    expect(res.status).toBe(404)
  })

  // Стрічка вже не показує закриту заявку, але свою історію майстер бачить.
  it('майстер із власною пропозицією бачить навіть закриту заявку', async () => {
    prisma.job.findUnique.mockResolvedValue({ ...job, status: 'IN_PROGRESS' })
    prisma.user.findUnique.mockResolvedValue(viewer())
    prisma.proposal.findFirst.mockResolvedValue({ id: 'prop-1' })

    const body = await okJson<{ isOwner: boolean }>(() =>
      GET(
        makeEvent({ params: { id: 'job-1' }, locals: sessionUser('master-1') }),
      ),
    )
    expect(body.isOwner).toBe(false)
  })

  it('майстер без пропозиції на закриту заявку отримує 404', async () => {
    prisma.job.findUnique.mockResolvedValue({ ...job, status: 'IN_PROGRESS' })
    prisma.user.findUnique.mockResolvedValue(viewer())
    prisma.proposal.findFirst.mockResolvedValue(null)

    const res = await failure(() =>
      GET(
        makeEvent({ params: { id: 'job-1' }, locals: sessionUser('master-9') }),
      ),
    )
    expect(res.status).toBe(404)
  })

  it('рейтинг клієнта віддається плоским контрактом', async () => {
    prisma.job.findUnique.mockResolvedValue(job)
    prisma.user.findUnique.mockResolvedValue(viewer({ role: 'CLIENT' }))

    const body = await okJson<{
      job: { client: Record<string, unknown> }
    }>(() =>
      GET(
        makeEvent({ params: { id: 'job-1' }, locals: sessionUser('client-1') }),
      ),
    )

    expect(body.job.client.avgRating).toBe(5)
    expect(body.job.client).not.toHaveProperty('avgRatingAsClient')
  })
})

describe('DELETE /api/jobs/[id]', () => {
  it('гість отримує 401', async () => {
    const res = await failure(() =>
      DELETE(makeEvent({ params: { id: 'job-1' }, locals: anonymous })),
    )
    expect(res.status).toBe(401)
  })

  // Розходження з правилом «чуже → 404» з AGENTS.md: тут 403, тобто відповідь
  // підтверджує існування заявки. Ризик низький (id — cuid, перебором не
  // вгадаєш), але тест фіксує поведінку, щоб зміна була свідомою.
  it('чужу заявку не скасовує (403)', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      clientId: 'client-1',
      status: 'OPEN',
    })

    const res = await failure(() =>
      DELETE(
        makeEvent({ params: { id: 'job-1' }, locals: sessionUser('stranger') }),
      ),
    )
    expect(res.status).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('не-OPEN заявку скасувати не можна', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      clientId: 'client-1',
      status: 'IN_PROGRESS',
    })

    const res = await failure(() =>
      DELETE(
        makeEvent({ params: { id: 'job-1' }, locals: sessionUser('client-1') }),
      ),
    )
    expect(res.status).toBe(400)
  })

  // Скасування знімає заплановані хвилі — інакше таймер прокидається й будить
  // базу заради розсилки по неіснуючій заявці (гроші Neon за час обчислювача).
  it('власник скасовує заявку і хвилі знімаються', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      clientId: 'client-1',
      status: 'OPEN',
    })

    const body = await okJson<{ ok: boolean }>(() =>
      DELETE(
        makeEvent({ params: { id: 'job-1' }, locals: sessionUser('client-1') }),
      ),
    )

    expect(body.ok).toBe(true)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(cancelWaves).toHaveBeenCalledWith('job-1')
  })
})
