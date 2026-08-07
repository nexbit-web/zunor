import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { makeEvent, sessionUser, anonymous } from '../helpers/event'
import { Prisma } from '../../generated/prisma/client'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))

const { POST } = await import('../../routes/api/user/update/+server')

// Найдовший валідатор у проєкті — і найнебезпечніший, бо приймає сирий
// об'єкт від клієнта і кладе його в User. Дві дірки тут уже були: майстер
// понижував себе до клієнта, а будь-хто виставляв onboarded=true з порожнім
// профілем і повністю обходив онбординг. Обидва поля тепер ігноруються, і
// саме це тут стережуть тести.
//
// Ендпоінт віддає помилки як { error } зі статусом, а не через error(),
// тому перевіряємо Response, а не кинуту помилку.

const USER = 'user-1'

async function post(userId: string | null, body: unknown): Promise<Response> {
  return (await POST(
    makeEvent({ locals: userId ? sessionUser(userId) : anonymous, body }),
  )) as Response
}

beforeEach(() => {
  resetPrisma()
  prisma.category.count.mockResolvedValue(0)
})

describe('доступ', () => {
  it('гість — 401', async () => {
    const res = await post(null, { name: 'Оля' })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('зламаний JSON — 400, а не 500', async () => {
    const res = await post(USER, '{ ламаний')
    expect(res.status).toBe(400)
  })
})

describe('role та onboarded не приймаються з тіла', () => {
  // Регресія №1: майстер понижував себе до клієнта і «скидав» погану
  // репутацію разом із рейтингом та відгуками.
  it('role з тіла ігнорується', async () => {
    await post(USER, { role: 'CLIENT', name: 'Оля' })

    const data = prisma.user.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty('role')
  })

  it('навіть спроба стати ADMIN нічого не змінює', async () => {
    await post(USER, { role: 'ADMIN', name: 'Оля' })

    const data = prisma.user.update.mock.calls[0][0].data
    expect(data.role).toBeUndefined()
  })

  // ── ЗНАЙДЕНА ДІРКА ────────────────────────────────────────────────────
  //
  // Коментар у роуті (рядки 88-91) стверджує, що role та onboarded більше
  // НЕ приймаються з тіла. Насправді прибрали лише role: рядок
  //
  //     if (body.onboarded === true) userData.onboarded = true
  //
  // лишився — і навіть двічі, на рядках 202 і 211. Тобто правку почали й
  // не довели до кінця, а коментар уже описує бажаний стан як доконаний.
  //
  // Наслідок: POST /api/user/update {"onboarded": true} відмикає весь
  // дашборд із ПОРОЖНІМ профілем — без імені, телефону, міста й ролі.
  // Замок 3 у hooks.server.ts (той, що замикає новачка в /onboarding)
  // обходиться одним запитом із DevTools. Онбординг — єдине місце, де
  // збираються дані, без яких заявка не поїде тим майстрам.
  //
  // Лікується видаленням обох рядків: поле має писати лише
  // $lib/server/profile.ts після повної валідації (див. profile-save.test.ts).
  //
  // Тест ЧЕРВОНИЙ навмисно.
  it('ДІРКА: onboarded=true з тіла відмикає дашборд без онбордингу', async () => {
    const res = await post(USER, { onboarded: true })
    expect(res.status).toBe(200)

    const calls = prisma.user.update.mock.calls
    const wrote = calls.length > 0 ? calls[0][0].data.onboarded : undefined
    expect(wrote).toBeUndefined()
  })
})

describe('валідація полів', () => {
  const bad: [string, unknown][] = [
    ['bio не рядок', { bio: 42 }],
    ['bio понад 922', { bio: 'я'.repeat(923) }],
    ['name не рядок', { name: { evil: 1 } }],
    ['name порожній', { name: '' }],
    ['name понад 80', { name: 'я'.repeat(81) }],
    ['city не рядок', { city: [] }],
    ['city понад 60', { city: 'я'.repeat(61) }],
    ['phone не рядок', { phone: 380_000_000 }],
    ['phone з літерами', { phone: 'телефон' }],
    ['description понад 2000', { description: 'я'.repeat(2001) }],
    ['isActive не булеве', { isActive: 'так' }],
    ['avatar не рядок і не null', { avatar: 42 }],
    ['avatarPublicId не рядок', { avatarPublicId: {} }],
  ]

  for (const [label, body] of bad) {
    it(`${label} → 400`, async () => {
      const res = await post(USER, body)
      expect(res.status).toBe(400)
      expect(prisma.user.update).not.toHaveBeenCalled()
    })
  }

  // Без перевірки типу не-рядок обходив би валідацію довжини й падав уже
  // в Prisma з 500 замість зрозумілого 400.
  it('null в avatar дозволений — це скидання фото', async () => {
    const res = await post(USER, { avatar: null, avatarPublicId: null })
    expect(res.status).toBe(200)
  })
})

describe('категорії', () => {
  it('не масив — 400', async () => {
    expect((await post(USER, { categories: 'cleaning' })).status).toBe(400)
  })

  it('понад 10 категорій — 400', async () => {
    const many = Array.from({ length: 11 }, (_, i) => `cat-${i}`)
    expect((await post(USER, { categories: many })).status).toBe(400)
  })

  // Slug їде в запит до бази — формат перевіряється до того, як туди потрапить.
  it('slug поза форматом — 400', async () => {
    for (const slug of [
      'Cleaning',
      'clean ing',
      '../etc',
      'x'.repeat(81),
      '',
    ]) {
      const res = await post(USER, { categories: [slug] })
      expect(res.status).toBe(400)
    }
    expect(prisma.category.count).not.toHaveBeenCalled()
  })

  it('неіснуюча категорія — 400', async () => {
    prisma.category.count.mockResolvedValue(1)

    const res = await post(USER, { categories: ['cleaning', 'nonexistent'] })
    expect(res.status).toBe(400)
    expect(prisma.masterProfile.upsert).not.toHaveBeenCalled()
  })

  it('усі існуючі категорії зберігаються', async () => {
    prisma.category.count.mockResolvedValue(2)

    const res = await post(USER, { categories: ['cleaning', 'repair'] })
    expect(res.status).toBe(200)
    expect(
      prisma.masterProfile.upsert.mock.calls[0][0].update.categories,
    ).toEqual(['cleaning', 'repair'])
  })

  it('перевіряються лише активні категорії', async () => {
    prisma.category.count.mockResolvedValue(1)
    await post(USER, { categories: ['cleaning'] })

    expect(prisma.category.count.mock.calls[0][0].where.isActive).toBe(true)
  })
})

describe('username', () => {
  it('не рядок — 400 з полем username', async () => {
    const res = await post(USER, { username: 42 })
    expect(res.status).toBe(400)
    expect((await res.json()).field).toBe('username')
  })

  it('поза форматом — 400', async () => {
    for (const u of ['ab', 'a'.repeat(21), '1abc', 'a-b', 'a.b', 'ad/min']) {
      expect((await post(USER, { username: u })).status).toBe(400)
    }
  })

  it('зарезервоване імʼя — 400', async () => {
    const res = await post(USER, { username: 'admin' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('reserved')
  })

  it('обхід регістром не працює', async () => {
    expect((await post(USER, { username: 'AdMiN' })).status).toBe(400)
  })

  it('нормалізується до нижнього регістру перед записом', async () => {
    await post(USER, { username: '  MiHaLcAnN ' })
    expect(prisma.user.update.mock.calls[0][0].data.username).toBe('mihalcann')
  })

  // Гонка: перевірка зайнятості й запис не атомарні, тож остаточне слово —
  // за унікальним індексом. Головне, щоб це був зрозумілий 409, а не 500.
  it('зайнятий username → 409, а не 500', async () => {
    prisma.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    )

    const res = await post(USER, { username: 'mihalcann' })
    expect(res.status).toBe(409)
    expect((await res.json()).field).toBe('username')
  })

  it('інша помилка бази не маскується під 409', async () => {
    prisma.user.update.mockRejectedValue(new Error('connection lost'))

    await expect(post(USER, { username: 'mihalcann' })).rejects.toThrow(
      'connection lost',
    )
  })
})

describe('профіль майстра', () => {
  it('без майстер-полів upsert не викликається', async () => {
    await post(USER, { name: 'Оля' })
    expect(prisma.masterProfile.upsert).not.toHaveBeenCalled()
  })

  it('подача на модерацію ставить PENDING і чистить причину відмови', async () => {
    await post(USER, { submitForReview: true })

    const update = prisma.masterProfile.upsert.mock.calls[0][0].update
    expect(update.verificationStatus).toBe('PENDING')
    expect(update.verificationRejectReason).toBeNull()
  })

  it('upsert прив’язаний саме до свого userId', async () => {
    await post(USER, { isActive: false })

    expect(prisma.masterProfile.upsert.mock.calls[0][0].where).toEqual({
      userId: USER,
    })
  })
})

describe('порожній запит', () => {
  it('нічого не пише і не падає', async () => {
    const res = await post(USER, {})
    expect(res.status).toBe(200)
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.masterProfile.upsert).not.toHaveBeenCalled()
  })
})
