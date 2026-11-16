import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { makeEvent, sessionUser, anonymous } from '../helpers/event'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))

const { POST } = await import('../../routes/api/user/update/+server')

// Старий ендпоінт, що приймає сирий об'єкт від клієнта і кладе його в User.
// Дірки тут уже були, і кожну стереже свій тест:
//   • майстер понижував себе до клієнта (role з тіла);
//   • будь-хто виставляв onboarded=true з порожнім профілем і обходив
//     онбординг;
//   • avatar і avatarPublicId писались як є: аватаром ставало будь-яке
//     посилання, а чужий publicId потім стирав чужий файл із Cloudinary;
//   • анкету майстра (і місце в черзі модерації) отримував будь-хто, а
//     категорії й опис мінялись в обхід повторної перевірки.
// Усі ці поля тепер ігноруються або відхиляються — профіль пише лише
// $lib/server/profile.ts, фото — /api/user/media.
//
// Ендпоінт віддає помилки як { error } зі статусом, а не через error(),
// тому перевіряємо Response, а не кинуту помилку.

const USER = 'user-1'

// Ліміт запитів тримає стан у памʼяті модуля, а кейси тут — від одного
// користувача. Сам ліміт перевіряє окремий тест нижче (зі своїм id).
const limit = vi.hoisted(() =>
  vi.fn(async (_key: string, _options: unknown) => ({
    success: true,
    remaining: 1,
    resetAt: 0,
  })),
)
vi.mock('$lib/server/rate-limit', () => ({ limit }))

async function post(userId: string | null, body: unknown): Promise<Response> {
  return (await POST(
    makeEvent({ locals: userId ? sessionUser(userId) : anonymous, body }),
  )) as Response
}

beforeEach(() => {
  resetPrisma()
  limit.mockClear()
  limit.mockResolvedValue({ success: true, remaining: 1, resetAt: 0 })
  prisma.user.findUnique.mockResolvedValue({ role: 'CLIENT', city: 'odesa' })
  prisma.city.findFirst.mockResolvedValue({ slug: 'odesa' })
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

  it('тіло не обʼєктом — 400', async () => {
    for (const body of ['null', '[]', '"рядок"', '42']) {
      expect((await post(USER, body)).status).toBe(400)
    }
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('понад ліміт — 429 з Retry-After, у базу нічого не йде', async () => {
    limit.mockResolvedValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    })

    const res = await post(USER, { name: 'Оля' })

    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(prisma.user.update).not.toHaveBeenCalled()
    // Ключ — від сесійного id, не з тіла.
    expect(limit.mock.calls[0][0]).toBe(`user-update:${USER}`)
  })
})

// Фото профілю — лише через /api/user/media, де посилання й publicId
// перевіряються ($lib/server/own-media). Тут вони писались у базу як є.
describe('avatar та avatarPublicId не приймаються з тіла', () => {
  it('чуже посилання аватаром не стає', async () => {
    const res = await post(USER, {
      name: 'Оля',
      avatar: 'https://evil.com/tracker.gif',
    })
    expect(res.status).toBe(200)

    const data = prisma.user.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty('avatar')
  })

  // Головне: чужий publicId, записаний собі, наступною зміною фото стирав
  // ЧУЖИЙ файл із Cloudinary (id аватара вгадується за id користувача).
  it('чужий publicId у профіль не записується', async () => {
    const res = await post(USER, {
      name: 'Оля',
      avatar: 'https://res.cloudinary.com/test-cloud/image/upload/v1/zunor/users/other-user/avatar/profile.jpg',
      avatarPublicId: 'zunor/users/other-user/avatar/profile',
    })
    expect(res.status).toBe(200)

    const data = prisma.user.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty('avatarPublicId')
    expect(data).not.toHaveProperty('avatar')
  })

  it('лише фото в тілі — у базу нічого не йде, фото не скидається', async () => {
    for (const body of [
      { avatar: null, avatarPublicId: null },
      { avatar: 42, avatarPublicId: {} },
    ]) {
      const res = await post(USER, body)
      expect(res.status).toBe(200)
    }
    expect(prisma.user.update).not.toHaveBeenCalled()
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

  // Колись коментар у роуті стверджував, що role та onboarded більше НЕ
  // приймаються з тіла, — а насправді прибрали лише role: рядок
  //
  //     if (body.onboarded === true) userData.onboarded = true
  //
  // лишався, ще й двічі. Правку почали й не довели, а коментар уже описував
  // бажане як доконане.
  //
  // Наслідок був такий: POST {"onboarded": true} відмикав весь дашборд із
  // ПОРОЖНІМ профілем — без імені, телефону, міста й ролі. Замок 3 у
  // hooks.server.ts (той, що тримає новачка в /onboarding) обходився одним
  // запитом із DevTools, а онбординг — єдине місце, де збираються дані, без
  // яких заявка не поїде потрібним майстрам.
  //
  // Тепер поле пише лише $lib/server/profile.ts після повної валідації
  // (див. profile-save.test.ts).
  it('onboarded=true з тіла ігнорується', async () => {
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
    ['name з одного символу', { name: 'О' }],
    ['name із самих пробілів', { name: '    ' }],
    ['name понад 80', { name: 'я'.repeat(81) }],
    ['city не рядок', { city: [] }],
    ['city понад 60', { city: 'я'.repeat(61) }],
    ['phone не рядок', { phone: 380_000_000 }],
    ['phone з літерами', { phone: 'телефон' }],
    ['phone не український', { phone: '+12125551234' }],
    ['phone без коду країни', { phone: '0671234567' }],
    ['isActive не булеве', { isActive: 'так' }],
  ]

  for (const [label, body] of bad) {
    it(`${label} → 400`, async () => {
      const res = await post(USER, body)
      expect(res.status).toBe(400)
      expect(prisma.user.update).not.toHaveBeenCalled()
    })
  }

  it('імʼя зберігається без пробілів по краях', async () => {
    await post(USER, { name: '  Оля Петренко  ' })
    expect(prisma.user.update.mock.calls[0][0].data.name).toBe('Оля Петренко')
  })

  it('телефон у форматі +380… зберігається', async () => {
    await post(USER, { phone: '+380671234567' })
    expect(prisma.user.update.mock.calls[0][0].data.phone).toBe('+380671234567')
  })

  // За номером друга сторона замовлення звʼязується з людиною.
  it('порожній телефон номера не стирає', async () => {
    const res = await post(USER, { phone: '' })
    expect(res.status).toBe(200)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })
})

// Місто — лише зі списку активних: довільний рядок означав би заявки «в
// нікуди» і стрічку майстра за вигаданим містом.
describe('місто', () => {
  it('невідоме місто — 400', async () => {
    prisma.city.findFirst.mockResolvedValue(null)

    const res = await post(USER, { city: 'atlantida' })

    expect(res.status).toBe(400)
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.city.findFirst.mock.calls[0][0].where).toEqual({
      slug: 'atlantida',
      isActive: true,
    })
  })

  it('те саме місто район не чіпає', async () => {
    await post(USER, { city: 'odesa' })

    const data = prisma.user.update.mock.calls[0][0].data
    expect(data.city).toBe('odesa')
    expect(data).not.toHaveProperty('district')
  })

  // Район належить місту: з новим містом старий уже нічого не означає.
  it('нове місто скидає район', async () => {
    prisma.city.findFirst.mockResolvedValue({ slug: 'kyiv' })

    await post(USER, { city: 'kyiv' })

    const data = prisma.user.update.mock.calls[0][0].data
    expect(data.city).toBe('kyiv')
    expect(data.district).toBeNull()
  })
})

// Анкета майстра — те, що бачить модератор. Міняє її лише форма профілю
// ($lib/server/profile.ts): там уміння для підбору й повторна перевірка.
// Раніше цей шлях писав категорії й опис в обхід модерації і створював
// анкету будь-кому.
describe('анкета майстра тут не міняється', () => {
  const profileOnly: [string, unknown][] = [
    ['категорії', { categories: ['cleaning'] }],
    ['порожні категорії', { categories: [] }],
    ['опис', { description: 'Прибираю швидко й чисто' }],
    ['подача на перевірку', { submitForReview: true }],
  ]

  for (const [label, body] of profileOnly) {
    it(`${label} → 400, нічого не пишемо`, async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'MASTER', city: 'odesa' })

      const res = await post(USER, { name: 'Оля', ...(body as object) })

      expect(res.status).toBe(400)
      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(prisma.masterProfile.upsert).not.toHaveBeenCalled()
      expect(prisma.masterProfile.updateMany).not.toHaveBeenCalled()
      expect(prisma.masterProfile.create).not.toHaveBeenCalled()
    })
  }
})

// Username (нікнейм) більше не пишемо: публічної сторінки /@handle немає.
// Старі збірки застосунку ще шлють його — поле мовчки ігнорується.
describe('username', () => {
  it('ігнорується: не пишеться й не валідується', async () => {
    const res = await post(USER, { username: 42, name: 'Оля' })
    expect(res.status).toBe(200)
    expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty(
      'username',
    )
  })

  it('лише username — у базу нічого не йде', async () => {
    const res = await post(USER, { username: 'mihalcann' })
    expect(res.status).toBe(200)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })
})

describe('пауза майстра (isActive)', () => {
  it('без майстер-полів анкету не чіпаємо', async () => {
    await post(USER, { name: 'Оля' })
    expect(prisma.masterProfile.updateMany).not.toHaveBeenCalled()
    expect(prisma.masterProfile.upsert).not.toHaveBeenCalled()
  })

  // Раніше upsert створював анкету будь-кому — клієнт опинявся в базі
  // майстрів. Тепер пауза є лише в майстра, а анкету створює profile.ts.
  it('клієнт анкету не отримує — 403', async () => {
    const res = await post(USER, { isActive: true })

    expect(res.status).toBe(403)
    expect(prisma.masterProfile.updateMany).not.toHaveBeenCalled()
    expect(prisma.masterProfile.upsert).not.toHaveBeenCalled()
    expect(prisma.masterProfile.create).not.toHaveBeenCalled()
  })

  it('співробітник — теж 403', async () => {
    for (const role of ['ADMIN', 'MANAGER', 'MODERATOR']) {
      prisma.user.findUnique.mockResolvedValue({ role, city: 'odesa' })
      expect((await post(USER, { isActive: false })).status).toBe(403)
    }
    expect(prisma.masterProfile.updateMany).not.toHaveBeenCalled()
  })

  it('майстер ставить паузу лише на своїй анкеті', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'MASTER', city: 'odesa' })

    const res = await post(USER, { isActive: false })

    expect(res.status).toBe(200)
    expect(prisma.masterProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: USER },
      data: { isActive: false },
    })
    // Анкету тут не створюємо й статус перевірки не чіпаємо.
    expect(prisma.masterProfile.upsert).not.toHaveBeenCalled()
  })

  // Роль — з бази, а не із сесії: сесію клієнт теоретично контролює.
  it('роль читається з бази за сесійним id', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'MASTER', city: 'odesa' })
    await post(USER, { isActive: true })

    expect(prisma.user.findUnique.mock.calls[0][0].where).toEqual({ id: USER })
  })
})

describe('порожній запит', () => {
  it('нічого не пише і не падає', async () => {
    const res = await post(USER, {})
    expect(res.status).toBe(200)
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.masterProfile.upsert).not.toHaveBeenCalled()
    expect(prisma.masterProfile.updateMany).not.toHaveBeenCalled()
  })
})
