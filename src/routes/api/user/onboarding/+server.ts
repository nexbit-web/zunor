// src/routes/api/user/onboarding/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { cloudinary } from '$lib/cloudinary'
import type { RequestHandler } from './$types'

const USERNAME_RE = /^[a-z0-9_]{3,30}$/
const NAME_MIN = 2
const NAME_MAX = 80
const DESC_MIN = 50
const DESC_MAX = 2000
const PORTFOLIO_MAX = 6

/**
 * POST /api/user/onboarding
 *
 * Заповнення майстром свого профілю.
 * Створює/оновлює MasterProfile, переводить verificationStatus у PENDING.
 *
 * Body:
 *   {
 *     name, username, phone?, city, avatar?, avatarPublicId?,
 *     categories[], description,
 *     portfolioImages[], portfolioImagesPublicIds[]
 *   }
 */
export const POST: RequestHandler = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const userId = session.user.id

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      avatarPublicId: true,
      masterProfile: {
        select: {
          verificationStatus: true,
          portfolioImagesPublicIds: true,
        },
      },
    },
  })
  if (!me) throw error(401, 'Unauthorized')
  if (me.role !== 'MASTER') {
    throw error(403, 'Тільки майстри можуть оформлювати профіль')
  }

  const body = await request.json().catch(() => null)
  if (!body) throw error(400, 'Invalid JSON')

  // ─── Validation ───
  const name = String(body.name ?? '').trim()
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw error(400, `Імʼя: ${NAME_MIN}-${NAME_MAX} символів`)
  }

  const username = String(body.username ?? '')
    .trim()
    .toLowerCase()
  if (!USERNAME_RE.test(username)) {
    throw error(400, 'Username: 3-30 символів (a-z, 0-9, _)')
  }

  const phoneRaw = body.phone ? String(body.phone).trim() : ''
  const phone = phoneRaw || null
  if (phone && phone.length > 30) throw error(400, 'Невірний телефон')

  const city = String(body.city ?? '').trim()
  if (!city) throw error(400, 'Оберіть місто')

  const categories = Array.isArray(body.categories)
    ? (body.categories as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  if (categories.length === 0) throw error(400, 'Оберіть хоча б одну категорію')
  if (categories.length > 5) throw error(400, 'Максимум 5 категорій')

  const description = String(body.description ?? '').trim()
  if (description.length < DESC_MIN || description.length > DESC_MAX) {
    throw error(400, `Опис: ${DESC_MIN}-${DESC_MAX} символів`)
  }

  // Avatar
  const avatar = body.avatar ? String(body.avatar) : null
  const avatarPublicId = body.avatarPublicId
    ? String(body.avatarPublicId)
    : null

  // Portfolio
  const portfolioImages = Array.isArray(body.portfolioImages)
    ? body.portfolioImages
        .filter((s: unknown): s is string => typeof s === 'string')
        .slice(0, PORTFOLIO_MAX)
    : []
  const portfolioImagesPublicIds = Array.isArray(body.portfolioImagesPublicIds)
    ? body.portfolioImagesPublicIds
        .filter((s: unknown): s is string => typeof s === 'string')
        .slice(0, PORTFOLIO_MAX)
    : []

  // ─── Проверки существования ───
  const [usernameTaken, cityExists, categoriesValid] = await Promise.all([
    prisma.user.findFirst({
      where: { username, NOT: { id: userId } },
      select: { id: true },
    }),
    prisma.city.findUnique({ where: { slug: city }, select: { id: true } }),
    prisma.category.count({
      where: { slug: { in: categories }, isActive: true },
    }),
  ])
  if (usernameTaken) throw error(400, 'Username вже зайнято')
  if (!cityExists) throw error(400, 'Місто не знайдено')
  if (categoriesValid !== categories.length) {
    throw error(400, 'Деякі категорії не існують')
  }

  // ─── Cleanup старого аватара в Cloudinary, якщо замінений ───
  if (
    me.avatarPublicId &&
    avatarPublicId &&
    me.avatarPublicId !== avatarPublicId
  ) {
    cloudinary.uploader
      .destroy(me.avatarPublicId, { resource_type: 'image' })
      .catch((err) => console.error('[onboarding] cleanup avatar', err))
  }

  // Cleanup старих фото портфолио, якщо їх немає в новому списку
  const oldPortfolio = me.masterProfile?.portfolioImagesPublicIds ?? []
  const removedIds = oldPortfolio.filter(
    (id) => !portfolioImagesPublicIds.includes(id),
  )
  for (const id of removedIds) {
    cloudinary.uploader
      .destroy(id, { resource_type: 'image' })
      .catch((err) => console.error('[onboarding] cleanup portfolio', err))
  }

  // ─── Update в транзакції ───
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        name,
        username,
        phone,
        city,
        ...(avatar && { avatar }),
        ...(avatarPublicId && { avatarPublicId }),
      },
    }),
    prisma.masterProfile.upsert({
      where: { userId },
      create: {
        userId,
        categories,
        description,
        portfolioImages,
        portfolioImagesPublicIds,
        verificationStatus: 'PENDING',
        isActive: true,
      },
      update: {
        categories,
        description,
        portfolioImages,
        portfolioImagesPublicIds,
        verificationStatus: 'PENDING',
        verificationRejectReason: null,
        isActive: true,
      },
    }),
  ])

  return json({ success: true }, { status: 200 })
}
