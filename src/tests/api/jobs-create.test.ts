import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { startWaves, resetInfra } from '../helpers/infra'
import { makeEvent, sessionUser, anonymous, failure } from '../helpers/event'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/reference', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/reference')>()),
  getDistricts: (await import('../helpers/districts')).getDistricts,
}))
vi.mock('$lib/server/dispatch', async () => await import('../helpers/infra'))

const { POST } = await import('../../routes/api/jobs/+server')

// Створення заявки — вхідні ворота для даних з AI-потоку і з ручної форми.
// Клієнтському тілу тут не вірять узагалі: title генерує сервер, місто бере
// з профілю, metadata валідує конфіг категорії. Тести стежать, щоб жоден із
// цих запобіжників не зник.

const validMetadata = {
  premise: 'apartment',
  service: 'standard',
  when: 'today',
  rooms: '2',
}

/** Кожен тест бере свій userId: rate-limit тримає стан у пам'яті модуля. */
let seq = 0
function freshUser(): string {
  return `client-${++seq}-${Date.now()}`
}

function createEvent(userId: string, body: unknown) {
  return makeEvent({ locals: sessionUser(userId), body })
}

/** Чиста база з клієнтом, містом і категорією — для кожного створення. */
function primeDb() {
  resetPrisma()
  prisma.user.findUnique.mockResolvedValue({ city: 'odesa' })
  prisma.category.findUnique.mockResolvedValue({ id: 'cat-1' })
  prisma.city.findUnique.mockResolvedValue({ id: 'city-1' })
  prisma.job.create.mockResolvedValue({
    id: 'job-1',
    title: 'Прибирання квартири',
    category: 'cleaning',
    city: 'odesa',
    createdAt: new Date(),
  })
}

beforeEach(() => {
  primeDb()
  resetInfra()
})

describe('доступ і передумови', () => {
  it('гість — 401', async () => {
    const res = await failure(() =>
      POST(makeEvent({ locals: anonymous, body: { metadata: validMetadata } })),
    )
    expect(res.status).toBe(401)
  })

  // Місто беремо з профілю, а не з тіла: інакше заявка поїхала б майстрам
  // не того міста, і фільтр стрічки нічого не вартий.
  it('без міста в профілі заявку не створюємо', async () => {
    prisma.user.findUnique.mockResolvedValue({ city: null })

    const res = await failure(() =>
      POST(createEvent(freshUser(), { metadata: validMetadata })),
    )
    expect(res.status).toBe(400)
    expect(prisma.job.create).not.toHaveBeenCalled()
  })

  it('неіснуюче місто — 400', async () => {
    prisma.city.findUnique.mockResolvedValue(null)
    const res = await failure(() =>
      POST(createEvent(freshUser(), { metadata: validMetadata })),
    )
    expect(res.status).toBe(400)
  })
})

describe('валідація metadata', () => {
  it('без metadata — 400', async () => {
    expect(
      (await failure(() => POST(createEvent(freshUser(), {})))).status,
    ).toBe(400)
  })

  it('невідома послуга — 400', async () => {
    const res = await failure(() =>
      POST(
        createEvent(freshUser(), {
          metadata: { ...validMetadata, service: 'teleportation' },
        }),
      ),
    )
    expect(res.status).toBe(400)
    expect(prisma.job.create).not.toHaveBeenCalled()
  })

  it('дата в минулому — 400', async () => {
    const res = await failure(() =>
      POST(
        createEvent(freshUser(), {
          metadata: { ...validMetadata, when: '2020-01-01' },
        }),
      ),
    )
    expect(res.status).toBe(400)
  })

  it('у базу їде очищена metadata, а не тіло запиту', async () => {
    await POST(
      createEvent(freshUser(), {
        metadata: { ...validMetadata, floor: 999, evil: 'payload' },
      }),
    )

    const meta = prisma.job.create.mock.calls[0][0].data.metadata
    expect(meta).not.toHaveProperty('evil')
    // Поверх поза діапазоном мовчки відкидається, заявка лишається валідною.
    expect(meta).not.toHaveProperty('floor')
  })
})

// Від обсягу залежить, кого розсилка кличе першим, тож його рахує сервер
// із перевіреної metadata. Число з тіла запиту — недовірений ввід.
describe('обсяг заявки', () => {
  const effortOf = () =>
    prisma.job.create.mock.calls[0][0].data.effort as number

  it('рахується сервером і пишеться в заявку', async () => {
    await POST(createEvent(freshUser(), { metadata: validMetadata }))
    expect(effortOf()).toBeGreaterThanOrEqual(1)
    expect(effortOf()).toBeLessThanOrEqual(10)
  })

  it('effort з тіла запиту ігнорується', async () => {
    await POST(createEvent(freshUser(), { metadata: validMetadata }))
    const honest = effortOf()

    primeDb()
    await POST(
      createEvent(freshUser(), {
        metadata: { ...validMetadata, effort: 1 },
        effort: 1,
      }),
    )
    expect(effortOf()).toBe(honest)
  })

  // Поправка асистента проходить через браузер — тому лише на крок.
  it('поправка з чернетки — не більше ніж на одиницю', async () => {
    await POST(createEvent(freshUser(), { metadata: validMetadata }))
    const base = effortOf()

    primeDb()
    await POST(
      createEvent(freshUser(), {
        metadata: { ...validMetadata, effortAdjust: 9 },
      }),
    )
    expect(effortOf()).toBe(base)
  })

  it('більша площа — більший обсяг', async () => {
    await POST(
      createEvent(freshUser(), { metadata: { ...validMetadata, areaM2: 30 } }),
    )
    const small = effortOf()

    primeDb()
    await POST(
      createEvent(freshUser(), { metadata: { ...validMetadata, areaM2: 400 } }),
    )
    expect(effortOf()).toBeGreaterThan(small)
  })
})

describe('недовірені тексти', () => {
  it('клієнтський title не потрапляє в базу як є', async () => {
    await POST(
      createEvent(freshUser(), {
        metadata: validMetadata,
        title: 'Коротко', // менше мінімуму → фолбек на шаблон
      }),
    )

    expect(prisma.job.create.mock.calls[0][0].data.title).not.toBe('Коротко')
  })

  it('керуючі символи в title вичищаються', async () => {
    await POST(
      createEvent(freshUser(), {
        metadata: validMetadata,
        title: `Прибирання${String.fromCharCode(0)}\nвеликої квартири`,
      }),
    )

    const title = prisma.job.create.mock.calls[0][0].data.title as string
    expect(title).not.toContain('\n')
    expect(title).not.toContain(String.fromCharCode(0))
  })

  it('нотатка обрізається до 1000 символів', async () => {
    await POST(
      createEvent(freshUser(), {
        metadata: validMetadata,
        note: 'я'.repeat(5000),
      }),
    )

    const description = prisma.job.create.mock.calls[0][0].data.description
    expect(description).toHaveLength(1000)
  })
})

describe('вкладення', () => {
  // Чуже посилання у стрічці майстрів — це і фішинг, і витік IP майстра
  // на сторонній сервер.
  it('приймаються лише наші Cloudinary-посилання', async () => {
    await POST(
      createEvent(freshUser(), {
        metadata: validMetadata,
        attachments: [
          'https://res.cloudinary.com/ok/1.jpg',
          'https://evil.com/tracker.gif',
          'http://res.cloudinary.com/insecure.jpg',
          'javascript:alert(1)',
          42,
          null,
        ],
      }),
    )

    expect(prisma.job.create.mock.calls[0][0].data.attachments).toEqual([
      'https://res.cloudinary.com/ok/1.jpg',
    ])
  })

  it('масив вкладень має стелю в 10', async () => {
    await POST(
      createEvent(freshUser(), {
        metadata: validMetadata,
        attachments: Array.from(
          { length: 100 },
          (_, i) => `https://res.cloudinary.com/x/${i}.jpg`,
        ),
        attachmentsPublicIds: Array.from({ length: 100 }, (_, i) => `id-${i}`),
      }),
    )

    const data = prisma.job.create.mock.calls[0][0].data
    expect(data.attachments).toHaveLength(10)
    expect(data.attachmentsPublicIds).toHaveLength(10)
  })

  it('вкладення не масивом не ламають створення', async () => {
    await POST(
      createEvent(freshUser(), {
        metadata: validMetadata,
        attachments: 'усі мої фото',
      }),
    )

    expect(prisma.job.create.mock.calls[0][0].data.attachments).toEqual([])
  })
})

describe('успішне створення', () => {
  // Хвилі рахуються від createdAt заявки — тож саме її мозок і отримує.
  it('повертає 201 і запускає розсилку від часу створення заявки', async () => {
    const res = (await POST(
      createEvent(freshUser(), { metadata: validMetadata }),
    )) as Response

    expect(res.status).toBe(201)
    expect(startWaves).toHaveBeenCalledTimes(1)
    expect(startWaves.mock.calls[0][0]).toMatchObject({ id: 'job-1' })
    expect(startWaves.mock.calls[0][0].createdAt).toBeInstanceOf(Date)
  })

  it('заявка створюється зі статусом OPEN і терміном придатності', async () => {
    await POST(createEvent(freshUser(), { metadata: validMetadata }))

    const data = prisma.job.create.mock.calls[0][0].data
    expect(data.status).toBe('OPEN')
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(data.city).toBe('odesa')
  })

  // Район — як і місто — з профілю: з нього рахуються кільця розсилки, і
  // підставлений у тіло чужий район покликав би не тих майстрів.
  it('район заявки береться з профілю клієнта, а не з тіла', async () => {
    prisma.user.findUnique.mockResolvedValue({
      city: 'odesa',
      district: 'tairova',
    })

    await POST(
      createEvent(freshUser(), { metadata: validMetadata, district: 'center' }),
    )

    const select = prisma.user.findUnique.mock.calls[0][0].select
    expect(select.district).toBe(true)
    expect(prisma.job.create.mock.calls[0][0].data.district).toBe('tairova')
  })

  it('профіль без району — заявка без району, але створюється', async () => {
    for (const district of [null, 'зниклий-район']) {
      resetPrisma()
      prisma.user.findUnique.mockResolvedValue({ city: 'odesa', district })
      prisma.category.findUnique.mockResolvedValue({ id: 'cat-1' })
      prisma.city.findUnique.mockResolvedValue({ id: 'city-1' })
      prisma.job.create.mockResolvedValue({ id: 'job-1', title: 'Т' })

      const res = (await POST(
        createEvent(freshUser(), { metadata: validMetadata }),
      )) as Response
      expect(res.status).toBe(201)
      expect(prisma.job.create.mock.calls[0][0].data.district).toBeNull()
    }
  })

  it('строк життя заявки — тиждень від створення', async () => {
    await POST(createEvent(freshUser(), { metadata: validMetadata }))

    const { expiresAt } = prisma.job.create.mock.calls[0][0].data
    const days = (expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.99)
    expect(days).toBeLessThanOrEqual(7)
  })
})

describe('ліміт на створення', () => {
  // 10 заявок на годину: без цього одна людина забиває стрічку всіх майстрів
  // міста за хвилину.
  it('одинадцята заявка за годину відхиляється', async () => {
    const user = freshUser()

    for (let i = 0; i < 10; i++) {
      const res = (await POST(
        createEvent(user, { metadata: validMetadata }),
      )) as Response
      expect(res.status).toBe(201)
    }

    const res = await failure(() =>
      POST(createEvent(user, { metadata: validMetadata })),
    )
    expect(res.status).toBe(429)
  })

  it('ліміт персональний — сусід не постраждав', async () => {
    const spammer = freshUser()
    for (let i = 0; i < 11; i++) {
      try {
        await POST(createEvent(spammer, { metadata: validMetadata }))
      } catch {
        // одинадцята впала в ліміт — саме цього й чекаємо
      }
    }

    const res = (await POST(
      createEvent(freshUser(), { metadata: validMetadata }),
    )) as Response
    expect(res.status).toBe(201)
  })
})
