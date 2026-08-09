import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from './helpers/prisma-mock'
import { cloudinary, safeTrigger, resetInfra } from './helpers/infra'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('./helpers/prisma-mock')).prisma,
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
//   • кеш акаунта скидається одразу, інакше guard до 5 хвилин бачить старе.

const USER = 'user-1'

const validClient = {
  name: 'Оля Петренко',
  phone: '+380671234567',
  city: 'odesa',
  bio: 'Люблю чистоту',
}

const validMaster = {
  name: 'Іван Коваль',
  username: 'ivan_k',
  phone: '+380671234567',
  city: 'odesa',
  categories: ['cleaning'],
  description: 'я'.repeat(60),
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
  it('чужий аватар відкидається, а не зберігається', async () => {
    await saveClientProfile(USER, {
      ...validClient,
      avatar: 'https://evil.com/tracker.gif',
      avatarPublicId: 'x',
    })

    const data = prisma.user.update.mock.calls[0][0].data
    expect(data.avatar).toBeNull()
    // Без картинки і publicId зберігати нічого.
    expect(data.avatarPublicId).toBeNull()
  })

  it('свої джерела аватара проходять', async () => {
    for (const url of [
      'https://res.cloudinary.com/c/a.jpg',
      'https://lh3.googleusercontent.com/a',
    ]) {
      resetPrisma()
      prisma.user.findUnique.mockResolvedValue({
        role: 'CLIENT',
        avatarPublicId: null,
      })
      prisma.city.findFirst.mockResolvedValue({ slug: 'odesa' })

      await saveClientProfile(USER, { ...validClient, avatar: url })
      expect(prisma.user.update.mock.calls[0][0].data.avatar).toBe(url)
    }
  })

  it('старе фото прибирається з Cloudinary', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: 'CLIENT',
      avatarPublicId: 'old-id',
    })

    await saveClientProfile(USER, {
      ...validClient,
      avatar: 'https://res.cloudinary.com/c/new.jpg',
      avatarPublicId: 'new-id',
    })

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('old-id', {
      resource_type: 'image',
    })
  })
})

describe('майстер: валідація', () => {
  const bad: [string, unknown][] = [
    ['коротке імʼя', { ...validMaster, name: 'І' }],
    ['username зарезервований', { ...validMaster, username: 'admin' }],
    ['username поза форматом', { ...validMaster, username: 'ab' }],
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

  it('зайнятий username — 409', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'someone-else' })
    expect(await failsWith(() => saveMasterProfile(USER, validMaster))).toBe(
      409,
    )
  })

  it('власний username не вважається зайнятим', async () => {
    await saveMasterProfile(USER, validMaster)
    expect(prisma.user.findFirst.mock.calls[0][0].where.NOT).toEqual({
      id: USER,
    })
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

  it('портфоліо приймає лише наші посилання і має стелю в 6', async () => {
    await saveMasterProfile(USER, {
      ...validMaster,
      portfolioImages: [
        ...Array.from(
          { length: 10 },
          (_, i) => `https://res.cloudinary.com/c/${i}.jpg`,
        ),
        'https://evil.com/x.jpg',
      ],
    })

    const images =
      prisma.masterProfile.upsert.mock.calls[0][0].update.portfolioImages
    expect(images).toHaveLength(6)
    expect(
      images.every((u: string) => u.startsWith('https://res.cloudinary.com/')),
    ).toBe(true)
  })

  it('прибрані з портфоліо файли видаляються з Cloudinary', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: 'MASTER',
      avatarPublicId: null,
      masterProfile: { portfolioImagesPublicIds: ['keep', 'drop'] },
    })

    await saveMasterProfile(USER, {
      ...validMaster,
      portfolioImagesPublicIds: ['keep'],
    })

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('drop', {
      resource_type: 'image',
    })
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalledWith('keep', {
      resource_type: 'image',
    })
  })
})
