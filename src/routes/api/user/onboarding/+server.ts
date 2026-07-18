// src/routes/api/user/onboarding/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { cloudinary } from '$lib/cloudinary'
import { validateUsername } from '$lib/username'
import type { RequestHandler } from './$types'
import { safeTrigger, channels, events } from '$lib/server/pusher'

const PHONE_RE = /^\+380\d{9}$/
const NAME_MIN = 2
const NAME_MAX = 80
const DESC_MIN = 50
const DESC_MAX = 2000
const PORTFOLIO_MAX = 6

/**
 * POST /api/user/onboarding
 * Майстер заповнює свій профіль. Профіль активний одразу (isActive=true);
 * verificationStatus=PENDING — це статус бейджа «перевірено» (модерація),
 * він НЕ блокує роботу, лише чекає на перевірку модератором.
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
        select: { portfolioImagesPublicIds: true },
      },
    },
  })
  if (!me) throw error(401, 'Unauthorized')
  // Клієнт теж може заповнити профіль майстра — роль стане MASTER
  // атомарно при збереженні (нижче в транзакції).

  const body = await request.json().catch(() => null)
  if (!body) throw error(400, 'Invalid JSON')

  // ─── Валідація ───
  const name = String(body.name ?? '').trim()
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw error(400, `Імʼя: ${NAME_MIN}-${NAME_MAX} символів`)
  }

  // Username — за єдиним правилом із $lib/username (збігається з маршрутом /@username).
  const usernameResult = validateUsername(String(body.username ?? ''))
  if (!usernameResult.ok) {
    throw error(
      400,
      usernameResult.reason === 'reserved'
        ? 'Цей username зарезервовано'
        : 'Username: 3-20 символів, починається з літери (a-z, 0-9, _)',
    )
  }
  const username = usernameResult.value

  // Телефон обовʼязковий: +380 + 9 цифр
  const phone = String(body.phone ?? '').trim()
  if (!PHONE_RE.test(phone)) {
    throw error(400, 'Невірний телефон (формат: +380XXXXXXXXX)')
  }

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

  // ─── Перевірка існування ───
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

  // ─── Прибирання старого аватара в Cloudinary (fire-and-forget) ───
  if (
    me.avatarPublicId &&
    avatarPublicId &&
    me.avatarPublicId !== avatarPublicId
  ) {
    cloudinary.uploader
      .destroy(me.avatarPublicId, { resource_type: 'image' })
      .catch((err) => console.error('[onboarding] cleanup avatar', err))
  }

  // Прибирання видалених фото портфоліо
  const oldPortfolio = me.masterProfile?.portfolioImagesPublicIds ?? []
  const removedIds = oldPortfolio.filter(
    (id) => !portfolioImagesPublicIds.includes(id),
  )
  for (const id of removedIds) {
    cloudinary.uploader
      .destroy(id, { resource_type: 'image' })
      .catch((err) => console.error('[onboarding] cleanup portfolio', err))
  }

  // ─── Запис у транзакції: роль + профіль атомарно ───
  // verificationStatus=PENDING — статус бейджа «перевірено», не блокує роботу.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        role: 'MASTER', // роль перемикаємо атомарно зі створенням masterProfile
        name,
        username,
        phone,
        city,
        avatar, // null = явне скидання аватара
        avatarPublicId,
        bio: description, // дублюємо в bio для відображення профілю
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

  // ─── Сповіщення адмінів у CRM ───
  // Кожна подача = запит на (повторну) модерацію: майстер міг змінити дані,
  // тому сповіщаємо ЩОРАЗУ. Від зловживань захищає rate-limit на цьому endpoint.
  await safeTrigger(channels.admin, events.moderationNew, {
    name,
    resubmission: Boolean(me.masterProfile), // профіль уже існував → повторна подача
  })

  return json({ success: true }, { status: 200 })
}
