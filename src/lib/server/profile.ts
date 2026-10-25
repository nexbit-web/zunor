// Єдине джерело правди про запис профілю та ролі.
//
// Історія: раніше клієнт зберігався через /api/user/update, майстер —
// через /api/user/onboarding, і кожен шлях сам вирішував, чи виставляти
// onboarded. Майстер його не виставляв — звідси вічна петля на онбордингу.
// Тепер обидва шляхи заходять сюди.

import { error } from '@sveltejs/kit'
import { prisma } from './prisma'
import { getCategories, getCities, getDistricts } from './reference'
import { cloudinary } from './cloudinary'
import { safeTrigger, channels, events } from './pusher'
import { validateUsername } from '$lib/username'
import { cityDistricts, findDistrict, type District } from '$lib/geo/districts'
import { isTravelRadius } from '$lib/geo/travel'
import type { Role } from '../../generated/prisma/client'
import { invalidateAccount } from './account-cache'
import { forgetMasterPage } from './master-page'
import { refreshSessionUser } from './sessions'

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

/**
 * Район — обовʼязковий там, де для міста є райони в БД (зараз це Одеса):
 * з нього рахуються кільця розсилки, і без нього заявка йде всім підряд.
 * Для міста без районів — null, питати нема про що.
 */
function parseDistrict(
  districts: readonly District[],
  raw: unknown,
): string | null {
  if (districts.length === 0) return null
  const district = findDistrict(districts, asString(raw))
  if (!district) throw error(400, 'Оберіть район зі списку')
  return district.slug
}

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
  const [user, categories, cities, districts] = await Promise.all([
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
        district: true,
        bio: true,
        role: true,
        onboarded: true,
        masterProfile: {
          select: {
            categories: true,
            travelRadiusKm: true,
            description: true,
            portfolioImages: true,
            portfolioImagesPublicIds: true,
            verificationStatus: true,
            verificationRejectReason: true,
          },
        },
      },
    }),
    // Довідники з кешу в пам'яті процесу, а не з БД: вони однакові для всіх
    // і майже не змінюються, а ця функція обслуговує і онбординг, і кожне
    // відкриття /settings/profile — тобто будила базу двома зайвими
    // запитами щоразу. Див. $lib/server/reference.
    getCategories(),
    getCities(),
    getDistricts(),
  ])

  if (!user) throw error(401, 'Unauthorized')

  return {
    user,
    // Урізаємо до полів, які читають форми: усе зайве поїхало б у payload
    // сторінки на кожне її відкриття.
    categories: categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      icon: c.icon,
    })),
    cities: cities.map((c) => ({
      slug: c.slug,
      name: c.name,
      region: c.region,
      isCapital: c.isCapital,
    })),
    // Райони всіх міст разом: форма сама бере райони обраного міста, і
    // зміна міста не потребує нового запиту.
    districts,
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

  const district = parseDistrict(
    cityDistricts(await getDistricts(), city.slug),
    input.district,
  )

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
      district,
      bio,
      avatar,
      avatarPublicId: avatar ? avatarPublicId : null,
      role: 'CLIENT',
      // Виставляється ТІЛЬКИ тут, після повної валідації.
      onboarded: true,
    },
  })

  await afterProfileSaved(userId)
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

  const district = parseDistrict(
    cityDistricts(await getDistricts(), citySlug),
    input.district,
  )

  // Не передали зовсім — «будь-де»: так поводився профіль до появи радіуса.
  const travelRadiusKm = input.travelRadiusKm ?? null
  if (!isTravelRadius(travelRadiusKm)) {
    throw error(400, 'Оберіть, як далеко готові їздити')
  }

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
        district,
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
        travelRadiusKm,
        description,
        portfolioImages,
        portfolioImagesPublicIds,
        verificationStatus: 'PENDING',
        isActive: true,
      },
      update: {
        categories,
        travelRadiusKm,
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

  await afterProfileSaved(userId)
}

/**
 * Профіль записано повз better-auth — скидаємо все, що його кешує:
 *   • стан акаунта для guard (onboarded і роль) — інакше людина
 *     поверталась би на форму або бачила вкладки старої ролі;
 *   • копію користувача в сесіях — імʼя й аватар у меню;
 *   • публічну сторінку майстра.
 */
async function afterProfileSaved(userId: string): Promise<void> {
  await Promise.all([
    invalidateAccount(userId),
    refreshSessionUser(userId),
    forgetMasterPage(userId),
  ])
}
