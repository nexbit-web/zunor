import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { Notify, cloudinary, resetInfra } from '../helpers/infra'
import { makeEvent, sessionUser, anonymous, failure, okJson } from '../helpers/event'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/dispatch', async () => await import('../helpers/infra'))
vi.mock('$lib/server/notifications', async () => await import('../helpers/infra'))
vi.mock('$lib/server/cloudinary', async () => await import('../helpers/infra'))

const { PATCH } = await import('../../routes/api/jobs/[id]/+server')

// PATCH /api/jobs/[id] — клієнт змінює свою заявку. Тримається тут:
// чужу заявку не змінити (і не дізнатись, що вона є), закриту — теж; дані
// проходять ту саму перевірку, що й при створенні; фото — лише свої з
// нашої хмари; майстри з пропозицією дізнаються про зміну.

const OWNER = 'client-1'
const CLOUD = 'https://res.cloudinary.com/test-cloud/image/upload/v1'

const META = {
  premise: 'apartment',
  service: 'regular',
  when: '2026-11-20',
  rooms: '2',
  frequency: 'weekly',
}

function stored(over: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    clientId: OWNER,
    category: 'prybyrannya',
    status: 'OPEN',
    title: 'Підтримуюче прибирання двокімнатної квартири щотижня',
    description: 'Квартира після гостей.',
    metadata: { ...META },
    attachments: [`${CLOUD}/zunor/users/${OWNER}/jobs/a.jpg`],
    attachmentsPublicIds: [`zunor/users/${OWNER}/jobs/a`],
    createdAt: new Date('2026-11-08T10:00:00Z'),
    ...over,
  }
}

function patch(body: unknown, user = sessionUser(OWNER)) {
  return PATCH(
    makeEvent({ method: 'PATCH', url: '/api/jobs/job-1', params: { id: 'job-1' }, body, locals: user }),
  )
}

const keepPhotos = {
  attachments: [`${CLOUD}/zunor/users/${OWNER}/jobs/a.jpg`],
  attachmentsPublicIds: [`zunor/users/${OWNER}/jobs/a`],
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))
  resetPrisma()
  resetInfra()
  prisma.job.findUnique.mockResolvedValue(stored())
  prisma.job.updateMany.mockResolvedValue({ count: 1 })
  prisma.proposal.findMany.mockResolvedValue([])
  prisma.notification.findMany.mockResolvedValue([])
})

describe('доступ', () => {
  it('без сесії — 401', async () => {
    expect((await failure(() => patch({ metadata: META }, anonymous))).status).toBe(401)
  })

  it('чужа заявка — 404, нічого не пишемо', async () => {
    const res = await failure(() => patch({ metadata: META }, sessionUser('stranger')))
    expect(res.status).toBe(404)
    expect(prisma.job.updateMany).not.toHaveBeenCalled()
  })

  it('закрита заявка — 409', async () => {
    prisma.job.findUnique.mockResolvedValue(stored({ status: 'IN_PROGRESS' }))
    expect((await failure(() => patch({ metadata: META }))).status).toBe(409)
    expect(prisma.job.updateMany).not.toHaveBeenCalled()
  })

  it('майстра обрали між читанням і записом — 409, а не тихий успіх', async () => {
    prisma.job.updateMany.mockResolvedValue({ count: 0 })
    const res = await failure(() => patch({ metadata: { ...META, rooms: '3' }, ...keepPhotos }))
    expect(res.status).toBe(409)
    expect(prisma.job.updateMany.mock.calls[0][0].where).toEqual({ id: 'job-1', status: 'OPEN' })
  })
})

describe('дані', () => {
  it('некоректна умова — 400 від того ж валідатора, що й при створенні', async () => {
    const res = await failure(() => patch({ metadata: { ...META, service: 'nope' }, ...keepPhotos }))
    expect(res.status).toBe(400)
  })

  it('«завтра» записується датою від сьогодні, а не від дня створення заявки', async () => {
    await okJson(() => patch({ metadata: { ...META, when: 'tomorrow' }, ...keepPhotos }))
    expect(prisma.job.updateMany.mock.calls[0][0].data.metadata.when).toBe('2026-11-11')
  })

  it('зміна дати не чіпає назву; зміна кімнат — перегенеровує', async () => {
    await okJson(() => patch({ metadata: { ...META, when: '2026-11-25' }, ...keepPhotos }))
    expect(prisma.job.updateMany.mock.calls[0][0].data.title).toBe(stored().title)

    prisma.job.updateMany.mockClear()
    await okJson(() => patch({ metadata: { ...META, rooms: '3' }, ...keepPhotos }))
    expect(prisma.job.updateMany.mock.calls[0][0].data.title).not.toBe(stored().title)
  })

  it('площа від асистента зберігається, хоч форма її не показує', async () => {
    prisma.job.findUnique.mockResolvedValue(
      stored({ metadata: { ...META, service: 'deep', areaM2: 60 } }),
    )
    await okJson(() =>
      patch({ metadata: { ...META, service: 'deep', when: '2026-11-25' }, ...keepPhotos }),
    )
    expect(prisma.job.updateMany.mock.calls[0][0].data.metadata.areaM2).toBe(60)
  })

  it('без змін — нічого не пишемо й нікого не сповіщаємо', async () => {
    const body = await okJson<{ changed: boolean }>(() =>
      patch({ metadata: META, description: stored().description, ...keepPhotos }),
    )
    expect(body.changed).toBe(false)
    expect(prisma.job.updateMany).not.toHaveBeenCalled()
  })

  it('порожній опис — свідоме «без опису»', async () => {
    await okJson(() => patch({ metadata: META, description: '   ', ...keepPhotos }))
    expect(prisma.job.updateMany.mock.calls[0][0].data.description).toBeNull()
  })
})

describe('фото', () => {
  it('чуже посилання й чужа тека відкидаються, своє нове — приймається', async () => {
    await okJson(() =>
      patch({
        metadata: META,
        attachments: [
          `${CLOUD}/zunor/users/${OWNER}/jobs/a.jpg`,
          `${CLOUD}/zunor/users/${OWNER}/jobs/b.jpg`,
          'https://res.cloudinary.com/evil-cloud/image/upload/zunor/users/client-1/jobs/c.jpg',
          `${CLOUD}/zunor/users/other/jobs/d.jpg`,
        ],
        attachmentsPublicIds: [
          `zunor/users/${OWNER}/jobs/a`,
          `zunor/users/${OWNER}/jobs/b`,
          `zunor/users/${OWNER}/jobs/c`,
          'zunor/users/other/jobs/d',
        ],
      }),
    )
    expect(prisma.job.updateMany.mock.calls[0][0].data.attachmentsPublicIds).toEqual([
      `zunor/users/${OWNER}/jobs/a`,
      `zunor/users/${OWNER}/jobs/b`,
    ])
  })

  it('прибране фото стирається з хмари — після запису', async () => {
    await okJson(() => patch({ metadata: META, attachments: [], attachmentsPublicIds: [] }))
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(`zunor/users/${OWNER}/jobs/a`)
    expect(prisma.job.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      cloudinary.uploader.destroy.mock.invocationCallOrder[0],
    )
  })
})

describe('майстри з пропозицією', () => {
  it('отримують «заявку змінено», крім тих, у кого попереднє ще не прочитане', async () => {
    prisma.proposal.findMany.mockResolvedValue([{ masterId: 'm1' }, { masterId: 'm2' }])
    prisma.notification.findMany.mockResolvedValue([{ userId: 'm2' }])

    await okJson(() => patch({ metadata: { ...META, rooms: '3' }, ...keepPhotos }))

    expect(prisma.proposal.findMany.mock.calls[0][0].where).toEqual({ jobId: 'job-1', status: 'SENT' })
    expect(Notify.jobUpdated).toHaveBeenCalledTimes(1)
    expect(Notify.jobUpdated).toHaveBeenCalledWith('m1', 'job-1', expect.any(String))
  })
})
