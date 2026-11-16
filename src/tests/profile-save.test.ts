import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from './helpers/prisma-mock'
import { cloudinary, safeTrigger, resetInfra } from './helpers/infra'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('./helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/reference', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/reference')>()),
  getDistricts: (await import('./helpers/districts')).getDistricts,
}))
vi.mock('$lib/server/cloudinary', async () => await import('./helpers/infra'))
vi.mock('$lib/server/pusher', async () => await import('./helpers/infra'))

const { saveClientProfile, saveMasterProfile } =
  await import('$lib/server/profile')

// Єдине місце, де пишуться роль і onboarded. Обидва шляхи онбордингу
// (клієнт і майстер) заходять сюди — /api/user/update ці поля ігнорує
// навмисно. Тому саме тут живуть найдорожчі правила:
//
//   • MASTER → CLIENT заборонено назавжди (інакше репутацію можна «скинути»,
//     ставши клієнтом і повернувшись майстром із чистим профілем);
//   • onboarded виставляється ЛИШЕ після повної валідації;
//   • кеш акаунта скидається одразу, інакше guard до 5 хвилин бачить старе;
//   • район і радіус виїзду — тільки зі списку: з них рахуються кільця
//     розсилки, і сміття тут означало б покликати не тих майстрів.

const USER = 'user-1'

// Посилання — рівно такі, які віддає завантаження в НАШУ хмару (імʼя хмари
// — із заглушки $env): перевірка «файл свій» ($lib/server/own-media)
// дивиться і на хмару, і на теку, і на publicId.
const UPLOAD = 'https://res.cloudinary.com/test-cloud/image/upload/v1'
const urlOf = (publicId: string) => `${UPLOAD}/${publicId}.jpg`
const ownAvatarId = `zunor/users/${USER}/avatar/profile`
const ownAvatarUrl = urlOf(ownAvatarId)
const ownPhotoId = (name: string) => `zunor/users/${USER}/jobs/${name}`

const validClient = {
  name: 'Оля Петренко',
  phone: '+380671234567',
  city: 'odesa',
  district: 'center',
  bio: 'Люблю чистоту',
}

const validMaster = {
  name: 'Іван Коваль',
  phone: '+380671234567',
  city: 'odesa',
  district: 'tairova',
  categories: ['cleaning'],
  description: 'я'.repeat(60),
  vehicle: false,
  crew: 'SOLO',
}

/** Ловить кинутий error() і повертає статус. */
async function failsWith(run: () => Promise<unknown>): Promise<number> {
  try {
    await run()
  } catch (err) {
    const e = err as { status?: number }
    if (typeof e?.status === 'number') return e.status
    throw err
  }
  throw new Error('Очікувалась відмова, але виклик пройшов успішно')
}

beforeEach(() => {
  resetPrisma()
  resetInfra()
  prisma.user.findUnique.mockResolvedValue({
    role: 'CLIENT',
    avatarPublicId: null,
    masterProfile: null,
  })
  prisma.city.findFirst.mockResolvedValue({ slug: 'odesa' })
  prisma.city.findUnique.mockResolvedValue({ id: 'city-1' })
  prisma.category.count.mockResolvedValue(1)
  prisma.user.findFirst.mockResolvedValue(null)
})

describe('перехід ролей', () => {
  it('CLIENT → MASTER дозволено', async () => {
    await saveMasterProfile(USER, validMaster)
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('MASTER → MASTER (редагування) дозволено', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: 'MASTER',
      avatarPublicId: null,
      masterProfile: { portfolioImagesPublicIds: [] },
    })

    await saveMasterProfile(USER, validMaster)
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  // Головне правило: пониження ролі — це спосіб скинути погану репутацію.
  it('MASTER → CLIENT заборонено назавжди', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: 'MASTER',
      avatarPublicId: null,
    })

    const status = await failsWith(() => saveClientProfile(USER, validClient))
    expect(status).toBe(403)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  // Службові ролі через цю функцію не рухаються взагалі — тільки руками в БД.
  it('службові ролі не змінюються через форму', async () => {
    for (const role of ['ADMIN', 'MANAGER', 'MODERATOR']) {
      resetPrisma()
      prisma.user.findUnique.mockResolvedValue({ role, avatarPublicId: null })

      expect(await failsWith(() => saveClientProfile(USER, validClient))).toBe(
        403,
      )
    }
  })

  it('видалений акаунт із живою сесією — 401', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    expect(await failsWith(() => saveClientProfile(USER, validClient))).toBe(
      401,
    )
  })
})

describe('клієнт: валідація', () => {
  const bad: [string, unknown][] = [
    ['коротке імʼя', { ...validClient, name: 'О' }],
    ['довге імʼя', { ...validClient, name: 'я'.repeat(81) }],
    ['імʼя не рядок', { ...validClient, name: 42 }],
    ['телефон не український', { ...validClient, phone: '+12125551234' }],
    ['телефон без плюса', { ...validClient, phone: '0671234567' }],
    ['телефон із літерами', { ...validClient, phone: '+38067ABCDEFG' }],
    ['порожній телефон', { ...validClient, phone: '' }],
    ['опис понад 922', { ...validClient, bio: 'я'.repeat(923) }],
  ]

  for (const [label, body] of bad) {
    it(`${label} → 400`, async () => {
      expect(await failsWith(() => saveClientProfile(USER, body))).toBe(400)
      expect(prisma.user.update).not.toHaveBeenCalled()
    })
  }

  it('місто перевіряється по довіднику, а не приймається як є', async () => {
    prisma.city.findFirst.mockResolvedValue(null)

    expect(
      await failsWith(() =>
        saveClientProfile(USER, { ...validClient, city: 'вигадане-місто' }),
      ),
    ).toBe(400)
  })

  it('порожній body не валить процес — просто 400', async () => {
    expect(await failsWith(() => saveClientProfile(USER, null))).toBe(400)
  })
})

describe('клієнт: запис', () => {
  it('onboarded виставляється тільки після повної валідації', async () => {
    await saveClientProfile(USER, validClient)

    const data = prisma.user.update.mock.calls[0][0].data
    expect(data.onboarded).toBe(true)
    expect(data.role).toBe('CLIENT')
    expect(data.city).toBe('odesa')
  })

  // Аватар — вектор для трекінг-пікселів: приймаємо лише свої джерела.
  it('чужий аватар не зберігається', async () => {
    await saveClientProfile(USER, {
      ...validClient,
      avatar: 'https://evil.com/tracker.gif',
      avatarPublicId: 'x',
    })

    const data = prisma.user.update.mock.calls[0][0].data
    expect(data.avatar).toBeNull()
    expect(data.avatarPublicId).toBeNull()
  })

  // Кривий запит не стирає людині фото: лишається те, що було.
  it('недопустимий аватар лишає профіль як був', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: 'CLIENT',
      avatar: ownAvatarUrl,
      avatarPublicId: ownAvatarId,
    })

    await saveClientProfile(USER, {
      ...validClient,
      avatar: 'https://evil.com/tracker.gif',
      avatarPublicId: 'x',
    })

    const data = prisma.user.update.mock.calls[0][0].data
    expect(data.avatar).toBe(ownAvatarUrl)
    expect(data.avatarPublicId).toBe(ownAvatarId)
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled()
  })

  // Сам префікс res.cloudinary.com — не «наше»: це чужий акаунт Cloudinary,
  // тип fetch чи трансформація, тобто вміст, який можна підмінити.
  it('Cloudinary, але не наше завантаження, — не приймається', async () => {
    for (const avatar of [
      `https://res.cloudinary.com/attacker-cloud/image/upload/v1/${ownAvatarId}.jpg`,
      `https://res.cloudinary.com/test-cloud/image/fetch/https://evil.com/${ownAvatarId}.jpg`,
      `https://res.cloudinary.com/test-cloud/image/upload/l_fetch:aHR0cHM6Ly9ldmlsLmNvbQ/v1/${ownAvatarId}.jpg`,
      'https://res.cloudinary.com/c/a.jpg',
    ]) {
      resetPrisma()
      prisma.user.findUnique.mockResolvedValue({ role: 'CLIENT', avatarPublicId: null })
      prisma.city.findFirst.mockResolvedValue({ slug: 'odesa' })

      await saveClientProfile(USER, {
        ...validClient,
        avatar,
        avatarPublicId: ownAvatarId,
      })
      expect(prisma.user.update.mock.calls[0][0].data.avatar).toBeNull()
    }
  })

  // Головна дірка, яку тут закрито: publicId з тіла писався в базу як є,
  // і наступне збереження профілю стирало ЦЕЙ id із Cloudinary. Чужий id
  // (аватар вгадується: zunor/users/<id>/avatar/profile) — і чужий файл
  // зникав із хмари.
  it('чужий publicId у профіль не записується', async () => {
    const foreignId = 'zunor/users/other-user/avatar/profile'
    await saveClientProfile(USER, {
      ...validClient,
      avatar: urlOf(foreignId),
      avatarPublicId: foreignId,
    })

    const data = prisma.user.update.mock.calls[0][0].data
    expect(data.avatar).toBeNull()
    expect(data.avatarPublicId).toBeNull()
  })

  it('обхід теки через «..» не проходить', async () => {
    const sneaky = `zunor/users/${USER}/avatar/../../other-user/avatar/profile`
    await saveClientProfile(USER, {
      ...validClient,
      avatar: urlOf(sneaky),
      avatarPublicId: sneaky,
    })
    expect(prisma.user.update.mock.calls[0][0].data.avatarPublicId).toBeNull()
  })

  it('своє завантаження й фото з Google проходять', async () => {
    const cases: [string, string | null][] = [
      [ownAvatarUrl, ownAvatarId],
      ['https://lh3.googleusercontent.com/a', null],
    ]
    for (const [url, id] of cases) {
      resetPrisma()
      prisma.user.findUnique.mockResolvedValue({
        role: 'CLIENT',
        avatarPublicId: null,
      })
      prisma.city.findFirst.mockResolvedValue({ slug: 'odesa' })

      await saveClientProfile(USER, {
        ...validClient,
        avatar: url,
        avatarPublicId: id,
      })
      const data = prisma.user.update.mock.calls[0][0].data
      expect(data.avatar).toBe(url)
      expect(data.avatarPublicId).toBe(id)
    }
  })

  // Старі профілі не ламаємо: пара, що вже лежить у базі, лишається.
  it('те саме фото, що вже в профілі, зберігається як є', async () => {
    const legacy = 'https://res.cloudinary.com/c/legacy.jpg'
    prisma.user.findUnique.mockResolvedValue({
      role: 'CLIENT',
      avatar: legacy,
      avatarPublicId: 'legacy-id',
    })

    await saveClientProfile(USER, {
      ...validClient,
      avatar: legacy,
      avatarPublicId: 'legacy-id',
    })

    const data = prisma.user.update.mock.calls[0][0].data
    expect(data.avatar).toBe(legacy)
    expect(data.avatarPublicId).toBe('legacy-id')
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled()
  })

  it('старе фото прибирається з Cloudinary', async () => {
    const oldId = `zunor/users/${USER}/avatar/old`
    prisma.user.findUnique.mockResolvedValue({
      role: 'CLIENT',
      avatar: urlOf(oldId),
      avatarPublicId: oldId,
    })

    await saveClientProfile(USER, {
      ...validClient,
      avatar: ownAvatarUrl,
      avatarPublicId: ownAvatarId,
    })

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(oldId, {
      resource_type: 'image',
    })
  })

  // У базі міг лишитись чужий id із часів, коли його не перевіряли.
  // Стерти за ним чужий файл не можна ні зміною фото, ні його прибиранням.
  it('чужий id зі старого рядка бази з хмари не стирається', async () => {
    for (const next of [
      { avatar: ownAvatarUrl, avatarPublicId: ownAvatarId },
      { avatar: '', avatarPublicId: '' },
    ]) {
      resetPrisma()
      resetInfra()
      prisma.user.findUnique.mockResolvedValue({
        role: 'CLIENT',
        avatar: 'https://res.cloudinary.com/c/x.jpg',
        avatarPublicId: 'zunor/users/other-user/avatar/profile',
      })
      prisma.city.findFirst.mockResolvedValue({ slug: 'odesa' })

      await saveClientProfile(USER, { ...validClient, ...next })
      expect(cloudinary.uploader.destroy).not.toHaveBeenCalled()
    }
  })
})

describe('майстер: валідація', () => {
  const bad: [string, unknown][] = [
    ['коротке імʼя', { ...validMaster, name: 'І' }],
    ['телефон не український', { ...validMaster, phone: '+12125551234' }],
    ['без міста', { ...validMaster, city: '' }],
    ['без категорій', { ...validMaster, categories: [] }],
    ['категорії не масив', { ...validMaster, categories: 'cleaning' }],
    [
      'понад 5 категорій',
      { ...validMaster, categories: ['a', 'b', 'c', 'd', 'e', 'f'] },
    ],
    ['короткий опис', { ...validMaster, description: 'коротко' }],
    ['опис понад 2000', { ...validMaster, description: 'я'.repeat(2001) }],
  ]

  for (const [label, body] of bad) {
    it(`${label} → 400`, async () => {
      expect(await failsWith(() => saveMasterProfile(USER, body))).toBe(400)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  }

  // Нікнейм більше не питаємо (публічної сторінки /@handle немає). Старі
  // збірки застосунку ще шлють його — не валідується й не пишеться.
  it('username з тіла ігнорується', async () => {
    await saveMasterProfile(USER, { ...validMaster, username: 'ab' })
    expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty(
      'username',
    )
  })

  it('неіснуюче місто — 400', async () => {
    prisma.city.findUnique.mockResolvedValue(null)
    expect(await failsWith(() => saveMasterProfile(USER, validMaster))).toBe(
      400,
    )
  })

  it('неіснуюча категорія — 400', async () => {
    prisma.category.count.mockResolvedValue(0)
    expect(await failsWith(() => saveMasterProfile(USER, validMaster))).toBe(
      400,
    )
  })
})

describe('майстер: запис', () => {
  it('роль і профіль пишуться однією транзакцією', async () => {
    await saveMasterProfile(USER, validMaster)

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    const userData = prisma.user.update.mock.calls[0][0].data
    expect(userData.role).toBe('MASTER')
    expect(userData.onboarded).toBe(true)
  })

  it('кожна подача йде на модерацію', async () => {
    await saveMasterProfile(USER, validMaster)

    const upsert = prisma.masterProfile.upsert.mock.calls[0][0]
    expect(upsert.update.verificationStatus).toBe('PENDING')
    expect(upsert.update.verificationRejectReason).toBeNull()
    expect(safeTrigger).toHaveBeenCalledWith(
      'private-admin',
      'moderation:new',
      expect.objectContaining({ name: 'Іван Коваль' }),
    )
  })

  it('портфоліо приймає лише свої завантаження і має стелю в 6', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => ownPhotoId(`p${i}`))
    await saveMasterProfile(USER, {
      ...validMaster,
      portfolioImages: [...ids.map(urlOf), 'https://evil.com/x.jpg'],
      portfolioImagesPublicIds: [...ids, 'evil'],
    })

    const update = prisma.masterProfile.upsert.mock.calls[0][0].update
    expect(update.portfolioImages).toEqual(ids.slice(0, 6).map(urlOf))
    expect(update.portfolioImagesPublicIds).toEqual(ids.slice(0, 6))
  })

  it('чужа хмара, чужа тека й посилання без пари відкидаються', async () => {
    const own = ownPhotoId('ok')
    const foreign = 'zunor/users/other-user/jobs/x'
    await saveMasterProfile(USER, {
      ...validMaster,
      portfolioImages: [
        urlOf(own),
        // чужий акаунт Cloudinary зі «своїм» publicId у шляху
        `https://res.cloudinary.com/attacker-cloud/image/upload/v1/${ownPhotoId('a')}.jpg`,
        // чужа тека
        urlOf(foreign),
        // посилання не відповідає publicId
        urlOf(ownPhotoId('other')),
      ],
      portfolioImagesPublicIds: [own, ownPhotoId('a'), foreign, ownPhotoId('b')],
    })

    const update = prisma.masterProfile.upsert.mock.calls[0][0].update
    expect(update.portfolioImages).toEqual([urlOf(own)])
    expect(update.portfolioImagesPublicIds).toEqual([own])
  })

  // Старі анкети не ламаємо: фото, що вже в портфоліо, лишаються як є.
  it('фото, що вже були в анкеті, зберігаються', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: 'MASTER',
      avatarPublicId: null,
      masterProfile: {
        portfolioImages: ['https://res.cloudinary.com/c/old.jpg'],
        portfolioImagesPublicIds: ['legacy-id'],
      },
    })

    await saveMasterProfile(USER, {
      ...validMaster,
      portfolioImages: ['https://res.cloudinary.com/c/old.jpg'],
      portfolioImagesPublicIds: ['legacy-id'],
    })

    const update = prisma.masterProfile.upsert.mock.calls[0][0].update
    expect(update.portfolioImagesPublicIds).toEqual(['legacy-id'])
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled()
  })

  it('прибрані з портфоліо файли видаляються з Cloudinary', async () => {
    const keep = ownPhotoId('keep')
    const drop = ownPhotoId('drop')
    prisma.user.findUnique.mockResolvedValue({
      role: 'MASTER',
      avatarPublicId: null,
      masterProfile: {
        portfolioImages: [urlOf(keep), urlOf(drop)],
        portfolioImagesPublicIds: [keep, drop],
      },
    })

    await saveMasterProfile(USER, {
      ...validMaster,
      portfolioImages: [urlOf(keep)],
      portfolioImagesPublicIds: [keep],
    })

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(drop, {
      resource_type: 'image',
    })
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalledWith(keep, {
      resource_type: 'image',
    })
  })

  // Те саме правило, що й для аватара: чужий id у старому рядку бази —
  // не привід стирати чужий файл.
  it('чужі id зі старої анкети з хмари не стираються', async () => {
    const foreign = 'zunor/users/other-user/jobs/x'
    prisma.user.findUnique.mockResolvedValue({
      role: 'MASTER',
      avatar: 'https://res.cloudinary.com/c/x.jpg',
      avatarPublicId: 'zunor/users/other-user/avatar/profile',
      masterProfile: {
        portfolioImages: [urlOf(foreign), 'https://res.cloudinary.com/c/y.jpg'],
        portfolioImagesPublicIds: [foreign, 'legacy-id'],
      },
    })

    await saveMasterProfile(USER, {
      ...validMaster,
      avatar: ownAvatarUrl,
      avatarPublicId: ownAvatarId,
      portfolioImages: [],
      portfolioImagesPublicIds: [],
    })

    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled()
  })
})

describe('район і радіус виїзду', () => {
  // Без району заявка клієнта пішла б усім підряд, а майстра не було б у
  // жодному кільці, крім останнього. Для міста зі списком — обовʼязковий.
  it('клієнт без району в Одесі — 400', async () => {
    const { district: _, ...noDistrict } = validClient
    expect(await failsWith(() => saveClientProfile(USER, noDistrict))).toBe(400)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('вигаданий район не приймається як є', async () => {
    for (const district of ['nowhere', 'CENTER', ' ', 42, null]) {
      resetPrisma()
      prisma.user.findUnique.mockResolvedValue({
        role: 'CLIENT',
        avatarPublicId: null,
      })
      prisma.city.findFirst.mockResolvedValue({ slug: 'odesa' })

      expect(
        await failsWith(() =>
          saveClientProfile(USER, { ...validClient, district }),
        ),
      ).toBe(400)
    }
  })

  it('район клієнта пишеться в профіль', async () => {
    await saveClientProfile(USER, validClient)
    expect(prisma.user.update.mock.calls[0][0].data.district).toBe('center')
  })

  // Місто без списку районів працює як раніше: питати нема про що, а
  // район з іншого міста там нічого не означає.
  it('місто без списку районів — район не питаємо і пишемо null', async () => {
    prisma.city.findFirst.mockResolvedValue({ slug: 'mykolaiv' })

    await saveClientProfile(USER, {
      ...validClient,
      city: 'mykolaiv',
      district: 'center',
    })
    expect(prisma.user.update.mock.calls[0][0].data.district).toBeNull()
  })

  it('майстер без району в Одесі — 400', async () => {
    const { district: _, ...noDistrict } = validMaster
    expect(await failsWith(() => saveMasterProfile(USER, noDistrict))).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('район майстра пишеться в профіль', async () => {
    await saveMasterProfile(USER, validMaster)
    expect(prisma.user.update.mock.calls[0][0].data.district).toBe('tairova')
  })

  it('радіус — лише з фіксованих варіантів', async () => {
    for (const travelRadiusKm of [7, '5', -1, 0, 1000, 'будь-де']) {
      resetPrisma()
      prisma.user.findUnique.mockResolvedValue({
        role: 'CLIENT',
        avatarPublicId: null,
        masterProfile: null,
      })

      expect(
        await failsWith(() =>
          saveMasterProfile(USER, { ...validMaster, travelRadiusKm }),
        ),
      ).toBe(400)
    }
  })

  it('обраний радіус іде і в новий профіль, і в оновлення', async () => {
    await saveMasterProfile(USER, { ...validMaster, travelRadiusKm: 5 })

    const upsert = prisma.masterProfile.upsert.mock.calls[0][0]
    expect(upsert.create.travelRadiusKm).toBe(5)
    expect(upsert.update.travelRadiusKm).toBe(5)
  })

  // Старий клієнт форми радіуса не шле — це «будь-де», а не помилка.
  it('радіус не передали — будь-де (null)', async () => {
    await saveMasterProfile(USER, validMaster)
    expect(
      prisma.masterProfile.upsert.mock.calls[0][0].update.travelRadiusKm,
    ).toBeNull()
  })
})

// Відповіді для підбору: від них залежить, які заявки до майстра дійдуть.
// «Не відповів» означало б «отримуй усе» — той самий спам, від якого ці
// питання рятують, тож вони обовʼязкові. Авто й формат роботи — колонки
// MasterProfile, у metadata — лише вміння в межах категорії.
describe('майстер: відповіді для підбору', () => {
  const cleaner = {
    ...validMaster,
    categories: ['prybyrannya'],
    vehicle: true,
    crew: 'TEAM',
    skills: {
      prybyrannya: { services: ['windows', 'sofa'], premises: ['home'] },
    },
  }

  type Written = {
    hasVehicle: unknown
    crew: unknown
    metadata: unknown
  }
  const written = () =>
    prisma.masterProfile.upsert.mock.calls[0][0] as {
      create: Written
      update: Written
    }

  it('авто й формат — у колонки, уміння — у metadata; і в новий профіль, і в оновлення', async () => {
    await saveMasterProfile(USER, cleaner)

    for (const data of [written().create, written().update]) {
      expect(data.hasVehicle).toBe(true)
      expect(data.crew).toBe('TEAM')
      // Назви компанії окремим полем немає: вона — User.name.
      expect(data).not.toHaveProperty('companyName')
      // vehicle/team у JSON більше не пишемо: одне джерело правди.
      expect(data.metadata).toEqual({
        skills: {
          prybyrannya: { services: ['windows', 'sofa'], premises: ['home'] },
        },
      })
    }
  })

  // Анкета компанії питає назву замість імені — і вона ж показується
  // всюди, де видно майстра (профіль, пропозиції, чат, відгуки).
  it('компанія: назва — це імʼя акаунта', async () => {
    await saveMasterProfile(USER, {
      ...cleaner,
      crew: 'COMPANY',
      name: '  Чисто Сервіс  ',
    })
    expect(written().update.crew).toBe('COMPANY')
    expect(prisma.user.update.mock.calls[0][0].data.name).toBe('Чисто Сервіс')
  })

  // Старий клієнт форми ще шле companyName — сервер його не пише нікуди,
  // інакше в акаунта було б дві назви.
  it('старе поле companyName ігнорується', async () => {
    await saveMasterProfile(USER, {
      ...cleaner,
      crew: 'COMPANY',
      companyName: 'Чужа вивіска',
    })
    expect(written().update).not.toHaveProperty('companyName')
    expect(prisma.user.update.mock.calls[0][0].data.name).toBe(validMaster.name)
  })

  it('коротка назва компанії — помилка про назву, а не про імʼя', async () => {
    const err = await saveMasterProfile(USER, {
      ...cleaner,
      crew: 'COMPANY',
      name: 'Я',
    }).catch((e: { status: number; body: { message: string } }) => e)
    expect(err).toMatchObject({ status: 400 })
    expect((err as { body: { message: string } }).body.message).toMatch(
      /^Назва/,
    )
  })

  const bad: [string, unknown][] = [
    ['без відповіді про авто', { ...cleaner, vehicle: undefined }],
    ['авто рядком', { ...cleaner, vehicle: 'так' }],
    ['без формату роботи', { ...cleaner, crew: null }],
    ['вигаданий формат роботи', { ...cleaner, crew: 'ARMY' }],
    [
      'старе поле team замість формату',
      { ...cleaner, crew: undefined, team: true },
    ],
    [
      'задовга назва компанії',
      { ...cleaner, crew: 'COMPANY', name: 'я'.repeat(81) },
    ],
    [
      'прибирання без жодного виду',
      {
        ...cleaner,
        skills: { prybyrannya: { services: [], premises: ['home'] } },
      },
    ],
    [
      'прибирання без обʼєктів',
      {
        ...cleaner,
        skills: { prybyrannya: { services: ['deep'], premises: [] } },
      },
    ],
    ['прибирання без умінь зовсім', { ...cleaner, skills: undefined }],
  ]

  for (const [label, body] of bad) {
    it(`${label} → 400`, async () => {
      expect(await failsWith(() => saveMasterProfile(USER, body))).toBe(400)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  }

  // Ключі з довідника, без сміття з клієнта: умова розсилки будується з
  // них напряму, і вигадана послуга просто нікому не відповідала б.
  it('невідомі послуги й обʼєкти відкидаються, порядок — довідника', async () => {
    await saveMasterProfile(USER, {
      ...cleaner,
      skills: {
        prybyrannya: {
          services: ['sofa', 'hack', 'standard', 'sofa'],
          premises: ['business', 'mars'],
        },
      },
    })

    expect(written().update.metadata).toMatchObject({
      skills: {
        prybyrannya: { services: ['standard', 'sofa'], premises: ['business'] },
      },
    })
  })

  it('уміння категорії, якої майстер не обрав, не пишуться', async () => {
    await saveMasterProfile(USER, {
      ...validMaster,
      skills: { prybyrannya: { services: ['deep'], premises: ['home'] } },
    })
    expect(written().update.metadata).toMatchObject({ skills: {} })
  })
})
