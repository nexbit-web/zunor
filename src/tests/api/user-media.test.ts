import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { cloudinary, resetInfra } from '../helpers/infra'
import { makeEvent, sessionUser, anonymous } from '../helpers/event'
import { env } from '../mocks/env-dynamic-private'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/cloudinary', async () => await import('../helpers/infra'))

const { POST } = await import('../../routes/api/user/media/+server')

// Аватар і портфоліо — єдині картинки, які система показує від імені людини.
// Вони їдуть у публічний профіль, у листи і в JSON-LD, де CSP уже не діє,
// тому посилання мусить бути наше й прив'язане саме до цього користувача.
//
// Цей ендпоінт віддає 401 у власному форматі { error }, а не через error() —
// тому й перевіряємо статус на Response, а не на кинутій помилці.

const USER = 'user-1'

async function post(userId: string | null, body: unknown): Promise<Response> {
  return (await POST(
    makeEvent({ locals: userId ? sessionUser(userId) : anonymous, body }),
  )) as Response
}

// Ім'я хмари беремо з тієї самої заглушки $env, яку читає роут: перевірка
// «хмара наша» має спиратись на конфіг, а не на рядок, вигаданий у тесті.
const CLOUD = env.CLOUDINARY_CLOUD_NAME
const at = (path: string) =>
  `https://res.cloudinary.com/${CLOUD}/image/upload/v1/${path}.jpg`

const ownAvatarId = `zunor/users/${USER}/avatar`
const ownAvatarUrl = at(ownAvatarId)

beforeEach(() => {
  resetPrisma()
  resetInfra()
  prisma.user.findUnique.mockResolvedValue({ avatarPublicId: null })
  prisma.masterProfile.findUnique.mockResolvedValue(null)
})

describe('доступ', () => {
  it('гість — 401 у власному форматі { error }', async () => {
    const res = await post(null, { kind: 'avatar' })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('невідомий kind — 400', async () => {
    expect((await post(USER, { kind: 'nuke-database' })).status).toBe(400)
  })

  it('без kind — 400', async () => {
    expect((await post(USER, {})).status).toBe(400)
  })
})

describe('avatar: чужий publicId', () => {
  // Найважливіше: publicId прив'язаний до userId з СЕСІЇ, а не з тіла.
  it('чужий шлях у publicId — 403', async () => {
    const res = await post(USER, {
      kind: 'avatar',
      publicId: 'zunor/users/other-user/avatar',
      url: `https://res.cloudinary.com/${CLOUD}/image/upload/zunor/users/other-user/avatar.jpg`,
    })

    expect(res.status).toBe(403)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('шлях поза простором користувачів — 403', async () => {
    const res = await post(USER, {
      kind: 'avatar',
      publicId: 'zunor/system/logo',
      url: `https://res.cloudinary.com/${CLOUD}/image/upload/zunor/system/logo.jpg`,
    })
    expect(res.status).toBe(403)
  })

  // Префікс перевіряється разом зі слешем: інакше користувач user-1 забрав би
  // простір user-10.
  it('сусідній id із тим самим початком не проходить', async () => {
    const res = await post(USER, {
      kind: 'avatar',
      publicId: `zunor/users/${USER}0/avatar`,
      url: `https://res.cloudinary.com/${CLOUD}/image/upload/zunor/users/${USER}0/avatar.jpg`,
    })
    expect(res.status).toBe(403)
  })
})

describe('avatar: посилання', () => {
  const bad: [string, string][] = [
    ['чужий домен', `https://evil.com/image/upload/${ownAvatarId}.jpg`],
    [
      'http замість https',
      `http://res.cloudinary.com/${CLOUD}/image/upload/${ownAvatarId}.jpg`,
    ],
    ['домен-двійник', `https://res.cloudinary.com.evil.com/${ownAvatarId}.jpg`],
    ['піддомен-двійник', `https://evil-res.cloudinary.com/${ownAvatarId}.jpg`],
    ['не URL узагалі', 'просто рядок'],
    [
      'посилання без свого publicId',
      `https://res.cloudinary.com/${CLOUD}/image/upload/v1/other.jpg`,
    ],
  ]

  for (const [label, url] of bad) {
    it(`${label} — 403`, async () => {
      const res = await post(USER, {
        kind: 'avatar',
        publicId: ownAvatarId,
        url,
      })
      expect(res.status).toBe(403)
      expect(prisma.user.update).not.toHaveBeenCalled()
    })
  }

  it('своє посилання зберігається', async () => {
    const res = await post(USER, {
      kind: 'avatar',
      publicId: ownAvatarId,
      url: ownAvatarUrl,
    })

    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER },
      data: { avatar: ownAvatarUrl, avatarPublicId: ownAvatarId },
    })
  })

  it('старий аватар видаляється з Cloudinary', async () => {
    prisma.user.findUnique.mockResolvedValue({
      avatarPublicId: 'old-avatar-id',
    })

    await post(USER, {
      kind: 'avatar',
      publicId: ownAvatarId,
      url: ownAvatarUrl,
    })

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('old-avatar-id')
  })

  it('збій видалення старого файлу не валить запит', async () => {
    prisma.user.findUnique.mockResolvedValue({
      avatarPublicId: 'old-avatar-id',
    })
    cloudinary.uploader.destroy.mockRejectedValueOnce(
      new Error('cloudinary down'),
    )

    const res = await post(USER, {
      kind: 'avatar',
      publicId: ownAvatarId,
      url: ownAvatarUrl,
    })
    expect(res.status).toBe(200)
  })
})

// Ім'я хмари Cloudinary — це ПЕРШИЙ сегмент шляху, і воно перевіряється
// нарівні з хостом. Без цього підходило б посилання на ЧУЖИЙ акаунт, аби в
// шляху десь трапився свій publicId:
//
//   https://res.cloudinary.com/АКАУНТ-ЗЛОВМИСНИКА/image/upload/v1/zunor/users/<свій-id>/avatar.jpg
//
// Наслідок був не «чужий аватар» (publicId усе ще свій), а обхід нашого
// пайплайну завантаження: картинку віддає сервер, який ми не контролюємо.
// Її можна підмінити ПІСЛЯ модерації (завантажив нейтральне — підмінив на
// що завгодно) і рахувати, хто дивився профіль.
describe('чужий Cloudinary-акаунт', () => {
  const foreignCloudUrl = `https://res.cloudinary.com/attacker-cloud/image/upload/v1/${ownAvatarId}.jpg`

  it('аватар з чужої хмари — 403', async () => {
    const res = await post(USER, {
      kind: 'avatar',
      publicId: ownAvatarId,
      url: foreignCloudUrl,
    })
    expect(res.status).toBe(403)
  })

  it('портфоліо з чужої хмари — 403', async () => {
    const publicId = `zunor/users/${USER}/portfolio-1`
    const res = await post(USER, {
      kind: 'portfolio-add',
      publicId,
      url: `https://res.cloudinary.com/attacker-cloud/image/upload/v1/${publicId}.jpg`,
    })
    expect(res.status).toBe(403)
  })
})

describe('portfolio', () => {
  const publicId = `zunor/users/${USER}/portfolio-1`
  const url = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/${publicId}.jpg`

  it('чужий publicId — 403', async () => {
    const res = await post(USER, {
      kind: 'portfolio-add',
      publicId: 'zunor/users/other/portfolio-1',
      url: `https://res.cloudinary.com/${CLOUD}/zunor/users/other/portfolio-1.jpg`,
    })
    expect(res.status).toBe(403)
  })

  it('більше шести фото не додається', async () => {
    prisma.masterProfile.findUnique.mockResolvedValue({
      portfolioImages: Array.from({ length: 6 }, (_, i) => `url-${i}`),
      portfolioImagesPublicIds: Array.from({ length: 6 }, (_, i) => `id-${i}`),
    })

    const res = await post(USER, { kind: 'portfolio-add', publicId, url })
    expect(res.status).toBe(400)
    expect(prisma.masterProfile.update).not.toHaveBeenCalled()
  })

  it('повторне додавання того самого файлу не дублює запис', async () => {
    prisma.masterProfile.findUnique.mockResolvedValue({
      portfolioImages: [url],
      portfolioImagesPublicIds: [publicId],
    })

    const res = await post(USER, { kind: 'portfolio-add', publicId, url })
    expect(res.status).toBe(200)
    expect(prisma.masterProfile.update).not.toHaveBeenCalled()
  })

  it('перше фото створює профіль майстра', async () => {
    prisma.masterProfile.findUnique.mockResolvedValue(null)

    await post(USER, { kind: 'portfolio-add', publicId, url })

    expect(prisma.masterProfile.create).toHaveBeenCalledWith({
      data: {
        userId: USER,
        portfolioImages: [url],
        portfolioImagesPublicIds: [publicId],
      },
    })
  })

  it('видалення чужого publicId — 403, файл не чіпаємо', async () => {
    const res = await post(USER, {
      kind: 'portfolio-remove',
      publicId: 'zunor/users/other/portfolio-1',
    })

    expect(res.status).toBe(403)
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled()
  })

  it('видалення свого фото прибирає і рядок, і файл', async () => {
    prisma.masterProfile.findUnique.mockResolvedValue({
      portfolioImages: ['a', url, 'c'],
      portfolioImagesPublicIds: ['id-a', publicId, 'id-c'],
    })

    const res = await post(USER, { kind: 'portfolio-remove', publicId })

    expect(res.status).toBe(200)
    expect(prisma.masterProfile.update.mock.calls[0][0].data).toEqual({
      portfolioImages: ['a', 'c'],
      portfolioImagesPublicIds: ['id-a', 'id-c'],
    })
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(publicId)
  })
})
