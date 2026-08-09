import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { signUploadParams, resetInfra } from '../helpers/infra'
import {
  makeEvent,
  sessionUser,
  anonymous,
  failure,
  okJson,
} from '../helpers/event'

const getCategories = vi.fn(async () => [
  { slug: 'cleaning', name: 'Прибирання', icon: 'Sparkle', isActive: true },
])
const getCities = vi.fn(async () => [
  { slug: 'odesa', name: 'Одеса', region: 'Одеська', isCapital: false },
])

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/cloudinary', async () => await import('../helpers/infra'))
vi.mock('$lib/server/reference', () => ({ getCategories, getCities }))

const uploadSignature =
  await import('../../routes/api/upload/signature/+server')
const badges = await import('../../routes/api/me/badges/+server')
const categories = await import('../../routes/api/categories/+server')
const cities = await import('../../routes/api/cities/+server')

// Дрібні ендпоінти. Головне тут — підпис завантаження: він видає браузеру
// право покласти файл у наше сховище, і тека мусить рахуватись від userId
// із СЕСІЇ, інакше будь-хто пише в чужу.

/** Кожен тест бере свій userId: rate-limit тримає стан у пам'яті модуля. */
let seq = 0
const freshUser = () => `misc-user-${++seq}-${Date.now()}`

beforeEach(() => {
  resetPrisma()
  resetInfra()
  getCategories.mockClear()
  getCities.mockClear()
})

describe('POST /api/upload/signature', () => {
  async function sign(userId: string | null, body: unknown): Promise<Response> {
    return (await uploadSignature.POST(
      makeEvent({ locals: userId ? sessionUser(userId) : anonymous, body }),
    )) as Response
  }

  it('гість — 401 у власному форматі { error }', async () => {
    const res = await sign(null, { kind: 'avatar' })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(signUploadParams).not.toHaveBeenCalled()
  })

  it('невідомий kind — 400', async () => {
    for (const kind of ['../../etc', 'system', 'backup', '']) {
      const res = await sign(freshUser(), { kind })
      expect(res.status).toBe(400)
    }
    expect(signUploadParams).not.toHaveBeenCalled()
  })

  // Тека рахується від сесійного id: підставити чужий у тілі неможливо,
  // бо його там просто не читають.
  it('тека завжди прив’язана до свого userId', async () => {
    const user = freshUser()

    await sign(user, { kind: 'avatar', userId: 'чужий-id' })
    expect(signUploadParams.mock.calls[0][0].folder).toBe(
      `zunor/users/${user}/avatar`,
    )

    await sign(user, { kind: 'job' })
    expect(signUploadParams.mock.calls[1][0].folder).toBe(
      `zunor/users/${user}/jobs`,
    )

    await sign(user, { kind: 'chat' })
    expect(signUploadParams.mock.calls[2][0].folder).toBe(`zunor/chat/${user}`)
  })

  it('аватар отримує фіксований public_id — нове фото перезаписує старе', async () => {
    const user = freshUser()
    await sign(user, { kind: 'avatar' })

    expect(signUploadParams.mock.calls[0][0].publicId).toBe(
      `zunor/users/${user}/avatar/profile`,
    )
  })

  it('невідомий resourceType падає у безпечний auto', async () => {
    await sign(freshUser(), { kind: 'job', resourceType: 'video-exploit' })
    expect(signUploadParams.mock.calls[0][0].resourceType).toBe('auto')
  })

  // Підпис — це право на запис у сховище: без ліміту одним скриптом можна
  // залити скільки завгодно файлів і на скільки завгодно грошей.
  it('31-й підпис за хвилину — 429 з Retry-After', async () => {
    const user = freshUser()

    for (let i = 0; i < 30; i++) {
      expect((await sign(user, { kind: 'job' })).status).toBe(200)
    }

    const res = await sign(user, { kind: 'job' })
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })
})

describe('GET /api/me/badges', () => {
  it('гість — 401', async () => {
    const res = await failure(() =>
      badges.GET(makeEvent({ url: '/api/me/badges', locals: anonymous })),
    )
    expect(res.status).toBe(401)
  })

  it('рахує лише свої непрочитані', async () => {
    prisma.notification.count.mockResolvedValue(7)

    const body = await okJson<{ notifications: number }>(() =>
      badges.GET(
        makeEvent({ url: '/api/me/badges', locals: sessionUser('u1') }),
      ),
    )

    expect(body.notifications).toBe(7)
    expect(prisma.notification.count.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      isRead: false,
    })
  })

  // Один запит на всю сесію: цей ендпоінт колись рахував ще й непрочитані
  // чати корельованим підзапитом по всій переписці.
  it('робить рівно один запит до бази', async () => {
    prisma.notification.count.mockResolvedValue(0)
    await badges.GET(
      makeEvent({ url: '/api/me/badges', locals: sessionUser('u1') }),
    )

    expect(prisma.notification.count).toHaveBeenCalledTimes(1)
    expect(prisma.chat.count).not.toHaveBeenCalled()
    expect(prisma.message.count).not.toHaveBeenCalled()
  })
})

describe('довідники', () => {
  // Обидва читають кеш у пам'яті процесу, а не базу: список міст міняється
  // раз на місяці, а запит іде з кожної форми. На Neon зайвий SELECT — це
  // прокидання бази й гроші за час обчислювача.
  it('категорії беруться з кеша, а не з БД', async () => {
    const body = await okJson<{ categories: unknown[] }>(() =>
      categories.GET(makeEvent({ url: '/api/categories' })),
    )

    expect(getCategories).toHaveBeenCalledTimes(1)
    expect(body.categories).toHaveLength(1)
    expect(prisma.category.findMany).not.toHaveBeenCalled()
  })

  it('міста беруться з кеша, а не з БД', async () => {
    const body = await okJson<{ cities: unknown[] }>(() =>
      cities.GET(makeEvent({ url: '/api/cities' })),
    )

    expect(getCities).toHaveBeenCalledTimes(1)
    expect(body.cities).toHaveLength(1)
    expect(prisma.city.findMany).not.toHaveBeenCalled()
  })

  // Довідники публічні й однакові для всіх — їх можна кешувати на краю.
  it('обидва віддають публічний cache-control', async () => {
    const headers: Record<string, string>[] = []
    const capture = (h: Record<string, string>) => {
      headers.push(h)
    }

    await categories.GET({
      ...makeEvent({ url: '/api/categories' }),
      setHeaders: capture,
    })
    await cities.GET({
      ...makeEvent({ url: '/api/cities' }),
      setHeaders: capture,
    })

    expect(headers).toHaveLength(2)
    for (const h of headers) {
      expect(h['cache-control']).toContain('public')
      expect(h['cache-control']).toContain('max-age=')
    }
  })

  it('гостю довідники доступні — вони потрібні на лендінгу', async () => {
    const res = (await categories.GET(
      makeEvent({ url: '/api/categories', locals: anonymous }),
    )) as Response
    expect(res.status).toBe(200)
  })
})
