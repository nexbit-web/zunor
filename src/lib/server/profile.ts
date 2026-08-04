// Єдине джерело правди про запис профілю та ролі.
//
// Історія: раніше клієнт зберігався через /api/user/update, майстер —
// через /api/user/onboarding, і кожен шлях сам вирішував, чи виставляти
// onboarded. Майстер його не виставляв — звідси вічна петля на онбордингу.
// Тепер обидва шляхи заходять сюди.

import { error } from '@sveltejs/kit'
import { prisma } from './prisma'
import { cloudinary } from './cloudinary'
import { safeTrigger, channels, events } from './pusher'
import { validateUsername } from '$lib/username'
import type { Role } from '../../generated/prisma/client'
import { invalidateAccount } from './account-cache'

// ═══════════════════ Обмеження ═══════════════════

const PHONE_RE = /^\+380\d{9}$/
const NAME_MIN = 2
const NAME_MAX = 80
const BIO_MAX = 922
const DESC_MIN = 50
const DESC_MAX = 2000
const CATEGORIES_MAX = 5
const PORTFOLIO_MAX = 6

/** Аватар приймаємо лише з наших джерел — інакше це вектор для трекінг-пікселів. */
function sanitizeAvatar(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null
  const ok =
    raw.startsWith('https://res.cloudinary.com/') ||
    raw.startsWith('https://lh3.googleusercontent.com/')
  return ok ? raw : null
}

const asString = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

// ═══════════════════ Правило переходу ролей ═══════════════════

/**
 * CLIENT → MASTER дозволено. MASTER → CLIENT — ні.
 *
 * Причина не в UI, а в даних: у майстра є рейтинг, відгуки, портфоліо
 * й історія замовлень. Зниження до клієнта осиротило б ці записи
 * і дало б спосіб «скинути» погану репутацію, ставши клієнтом
 * і повернувшись назад майстром із чистим профілем.
 *
 * Службові ролі (ADMIN/MANAGER/MODERATOR) через цю функцію не змінюються
 * взагалі — тільки вручну в БД.
 */
function assertRoleTransition(
  current: Role,
  target: 'CLIENT' | 'MASTER',
): void {
  if (current === target) return

  if (target === 'MASTER') {
    if (current === 'CLIENT') return
    throw error(403, 'Змінити роль неможливо')
  }

  // target === 'CLIENT'
  if (current === 'MASTER') {
    throw error(403, 'Виконавець не може повернутися до ролі замовника')
  }
  throw error(403, 'Змінити роль неможливо')
}

// ═══════════════════ Дані для форм ═══════════════════

/** Все, що потрібно обом формам: і на онбордингу, і на редагуванні. */
export async function loadProfileData(userId: string) {
  const [user, categories, cities] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        phone: true,
        avatar: true,
        avatarPublicId: true,
        city: true,
        bio: true,
        role: true,
        onboarded: true,
        masterProfile: {
          select: {
            categories: true,
            description: true,
            portfolioImages: true,
            portfolioImagesPublicIds: true,
            verificationStatus: true,
            verificationRejectReason: true,
          },
        },
      },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, name: true, icon: true },
    }),
    prisma.city.findMany({
      where: { isActive: true },
      orderBy: [{ isCapital: 'desc' }, { name: 'asc' }],
      select: { slug: true, name: true, region: true, isCapital: true },
    }),
  ])

  if (!user) throw error(401, 'Unauthorized')

  return {
    user,
    categories,
    cities,
    prefill: {
      name: user.name ?? '',
      phone: user.phone ?? '',
      citySlug: user.city ?? '',
      avatar: user.avatar ?? '',
      avatarPublicId: user.avatarPublicId ?? '',
    },
  }
}

// ═══════════════════ Клієнт ═══════════════════

export async function saveClientProfile(
  userId: string,
  body: unknown,
): Promise<void> {
  const input = (body ?? {}) as Record<string, unknown>

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, avatarPublicId: true },
  })
  if (!me) throw error(401, 'Unauthorized')

  assertRoleTransition(me.role, 'CLIENT')

  const name = asString(input.name)
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw error(400, `Імʼя: ${NAME_MIN}–${NAME_MAX} символів`)
  }

  const phone = asString(input.phone)
  if (!PHONE_RE.test(phone)) {
    throw error(400, 'Невірний телефон (формат: +380XXXXXXXXX)')
  }

  const citySlug = asString(input.city)
  const city = citySlug
    ? await prisma.city.findFirst({
        where: { slug: citySlug, isActive: true },
        select: { slug: true },
      })
    : null
  if (!city) throw error(400, 'Оберіть місто зі списку')

  const bio = asString(input.bio)
  if (bio.length > BIO_MAX) throw error(400, 'Опис занадто довгий')

  const avatar = sanitizeAvatar(input.avatar)
  const avatarPublicId =
    typeof input.avatarPublicId === 'string' ? input.avatarPublicId : null

  // Старе фото в Cloudinary — прибираємо, не чекаючи результату.
  if (me.avatarPublicId && me.avatarPublicId !== avatarPublicId) {
    cloudinary.uploader
      .destroy(me.avatarPublicId, { resource_type: 'image' })
      .catch((err) => console.error('[profile] cleanup avatar', err))
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      phone,
      city: city.slug,
      bio,
      avatar,
      avatarPublicId: avatar ? avatarPublicId : null,
      role: 'CLIENT',
      // Виставляється ТІЛЬКИ тут, після повної валідації.
      onboarded: true,
    },
  })

  // Скидаємо кеш guard: інакше людина після онбордингу до 30 секунд
  // поверталася б на форму — guard бачив би застаріле onboarded: false.
  invalidateAccount(userId)
}

// ═══════════════════ Майстер ═══════════════════

export async function saveMasterProfile(
  userId: string,
  body: unknown,
): Promise<void> {
  const input = (body ?? {}) as Record<string, unknown>

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      avatarPublicId: true,
      masterProfile: { select: { portfolioImagesPublicIds: true } },
    },
  })
  if (!me) throw error(401, 'Unauthorized')

  // CLIENT → MASTER пройде, MASTER → MASTER (редагування) теж.
  assertRoleTransition(me.role, 'MASTER')

  const name = asString(input.name)
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw error(400, `Імʼя: ${NAME_MIN}–${NAME_MAX} символів`)
  }

  const usernameResult = validateUsername(asString(input.username))
  if (!usernameResult.ok) {
    throw error(
      400,
      usernameResult.reason === 'reserved'
        ? 'Цей username зарезервовано'
        : 'Username: 3–20 символів, починається з літери (a-z, 0-9, _)',
    )
  }
  const username = usernameResult.value

  const phone = asString(input.phone)
  if (!PHONE_RE.test(phone)) {
    throw error(400, 'Невірний телефон (формат: +380XXXXXXXXX)')
  }

  const citySlug = asString(input.city)
  if (!citySlug) throw error(400, 'Оберіть місто')

  const categories = Array.isArray(input.categories)
    ? (input.categories as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  if (categories.length === 0) throw error(400, 'Оберіть хоча б одну категорію')
  if (categories.length > CATEGORIES_MAX) {
    throw error(400, `Максимум ${CATEGORIES_MAX} категорій`)
  }

  const description = asString(input.description)
  if (description.length < DESC_MIN || description.length > DESC_MAX) {
    throw error(400, `Опис: ${DESC_MIN}–${DESC_MAX} символів`)
  }

  const avatar = sanitizeAvatar(input.avatar)
  const avatarPublicId =
    typeof input.avatarPublicId === 'string' ? input.avatarPublicId : null

  const portfolioImages = Array.isArray(input.portfolioImages)
    ? (input.portfolioImages as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .filter((s) => s.startsWith('https://res.cloudinary.com/'))
        .slice(0, PORTFOLIO_MAX)
    : []
  const portfolioImagesPublicIds = Array.isArray(input.portfolioImagesPublicIds)
    ? (input.portfolioImagesPublicIds as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .slice(0, PORTFOLIO_MAX)
    : []

  // ─── Перевірка існування довідників ───
  const [usernameTaken, cityExists, categoriesValid] = await Promise.all([
    prisma.user.findFirst({
      where: { username, NOT: { id: userId } },
      select: { id: true },
    }),
    prisma.city.findUnique({ where: { slug: citySlug }, select: { id: true } }),
    prisma.category.count({
      where: { slug: { in: categories }, isActive: true },
    }),
  ])
  if (usernameTaken) throw error(409, 'Username вже зайнято')
  if (!cityExists) throw error(400, 'Місто не знайдено')
  if (categoriesValid !== categories.length) {
    throw error(400, 'Деякі категорії не існують')
  }

  // ─── Прибирання Cloudinary (fire-and-forget) ───
  if (
    me.avatarPublicId &&
    avatarPublicId &&
    me.avatarPublicId !== avatarPublicId
  ) {
    cloudinary.uploader
      .destroy(me.avatarPublicId, { resource_type: 'image' })
      .catch((err) => console.error('[profile] cleanup avatar', err))
  }

  const oldPortfolio = me.masterProfile?.portfolioImagesPublicIds ?? []
  for (const id of oldPortfolio.filter(
    (i) => !portfolioImagesPublicIds.includes(i),
  )) {
    cloudinary.uploader
      .destroy(id, { resource_type: 'image' })
      .catch((err) => console.error('[profile] cleanup portfolio', err))
  }

  // ─── Роль + профіль атомарно ───
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        role: 'MASTER',
        name,
        username,
        phone,
        city: citySlug,
        avatar,
        avatarPublicId: avatar ? avatarPublicId : null,
        bio: description,
        onboarded: true,
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

// Кожна подача = запит на (повторну) модерацію.
  await safeTrigger(channels.admin, events.moderationNew, {
    name,
    resubmission: Boolean(me.masterProfile),
  })

  // Тут змінюється і onboarded, і ROLE — без скидання кеша клієнт,
  // який щойно став майстром, до 30 секунд бачив би вкладки замовника.
  invalidateAccount(userId)
}
