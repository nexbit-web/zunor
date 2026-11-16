// * дані розділів налаштувань — одне місце для сторінок сайту й екранів
// * застосунку, щоб вони показували те саме

import { prisma } from './prisma'
import { activeOrdersCount } from './active-orders'
import { getCategories, getCities, getDistricts } from './reference'
import { telegramEnabled, telegramLinkUrl } from './telegram'
import {
  parseAiProfile,
  ABOUT_MAX,
  OBJECT_NOTE_MAX,
  MAX_OBJECTS,
} from './zunor/ai-profile'
import { PREMISES, SERVICES } from '$lib/categories/cleaning/presets'
import { parseMasterSkills } from '$lib/masters/meta'

/**
 * Профіль замовника для форми редагування в застосунку. Вужче за
 * loadProfileData (там ще категорії й анкета майстра для сайту): лише
 * поля форми клієнта й довідники міст і районів.
 */
export async function loadClientProfileForm(userId: string) {
  const [user, cities, districts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        phone: true,
        avatar: true,
        avatarPublicId: true,
        city: true,
        district: true,
        bio: true,
        role: true,
        onboarded: true,
      },
    }),
    getCities(),
    getDistricts(),
  ])
  if (!user) return null

  return {
    user,
    cities: cities.map((c) => ({ slug: c.slug, name: c.name })),
    // * райони всіх міст разом: форма сама бере райони обраного міста, і
    // * зміна міста не потребує нового запиту. Координати формі не
    // * потрібні — лише назва й група («Місто» / «Передмістя»)
    districts: districts.map((d) => ({
      citySlug: d.citySlug,
      slug: d.slug,
      name: d.name,
      group: d.group,
    })),
  }
}

/** Анкета майстра для форми профілю, з довідниками. Анкети ще немає — `master: null`. */
export async function loadMasterProfileForm(userId: string) {
  const [user, categories, cities, districts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        phone: true,
        avatar: true,
        avatarPublicId: true,
        city: true,
        district: true,
        role: true,
        masterProfile: {
          select: {
            categories: true,
            travelRadiusKm: true,
            hasVehicle: true,
            crew: true,
            metadata: true,
            description: true,
            portfolioImages: true,
            portfolioImagesPublicIds: true,
            verificationStatus: true,
            verificationRejectReason: true,
          },
        },
      },
    }),
    getCategories(),
    getCities(),
    getDistricts(),
  ])
  if (!user) return null

  const { masterProfile: mp, ...rest } = user
  return {
    user: rest,
    master: mp
      ? {
          categories: mp.categories,
          travelRadiusKm: mp.travelRadiusKm,
          hasVehicle: mp.hasVehicle,
          crew: mp.crew,
          // * уміння за категоріями ({ [slug]: … }) — без решти metadata
          skills: parseMasterSkills(mp.metadata),
          description: mp.description ?? '',
          portfolioImages: mp.portfolioImages,
          portfolioImagesPublicIds: mp.portfolioImagesPublicIds,
          verificationStatus: mp.verificationStatus,
          verificationRejectReason: mp.verificationRejectReason,
        }
      : null,
    categories: categories.map((c) => ({ slug: c.slug, name: c.name })),
    cities: cities.map((c) => ({ slug: c.slug, name: c.name })),
    districts: districts.map((d) => ({
      citySlug: d.citySlug,
      slug: d.slug,
      name: d.name,
      group: d.group,
    })),
  }
}

/** Способи входу (лише providerId) і чи можна зараз видалити акаунт. */
export async function loadSecuritySettings(user: {
  id: string
  email: string
}) {
  const [accounts, activeOrders] = await Promise.all([
    prisma.account.findMany({
      where: { userId: user.id },
      select: { providerId: true },
    }),
    activeOrdersCount(user.id),
  ])

  const providers = accounts.map((a) => a.providerId)

  return {
    // * 'credential' — вхід поштою й паролем
    hasPassword: providers.includes('credential'),
    hasGoogle: providers.includes('google'),
    email: user.email,
    activeOrders,
  }
}

/**
 * Сповіщення: Telegram. Бот не налаштований (немає TELEGRAM_BOT_TOKEN) —
 * `telegram: null`, блоку немає взагалі, і в базу за станом не ходимо.
 */
export async function loadNotificationSettings(userId: string) {
  if (!telegramEnabled()) return { telegram: null }

  // * сам id чату назовні не йде — лише «підключено чи ні»
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramChatId: true },
  })
  const linked = !!me?.telegramChatId

  return {
    telegram: {
      linked,
      // * посилання з токеном живе 15 хв — тому воно свіже на кожне
      // * читання, а сторінка й застосунок перечитують дані, коли людина
      // * повертається з Telegram
      linkUrl: linked ? null : await telegramLinkUrl(userId),
    },
  }
}

/**
 * Анкета AI-асистента замовника разом із пресетами, з яких вона
 * складається. Роль тут не перевіряється — це робить той, хто кличе:
 * сторінка перенаправляє, ендпоінт відповідає 403.
 */
export async function loadAssistantSettings(userId: string) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiProfile: true, name: true },
  })

  return {
    profile: parseAiProfile(me?.aiProfile),
    userName: me?.name ?? '',
    premises: PREMISES,
    services: SERVICES,
    limits: {
      about: ABOUT_MAX,
      objectNote: OBJECT_NOTE_MAX,
      maxObjects: MAX_OBJECTS,
    },
  }
}
