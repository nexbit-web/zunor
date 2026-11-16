// * єдине місце, що пише профіль і роль: і онбординг, і редагування

import { error } from '@sveltejs/kit'
import { prisma } from './prisma'
import { getCategories, getCities, getDistricts } from './reference'
import { cloudinary } from './cloudinary'
import {
  acceptedAvatar,
  acceptedPhotos,
  isOwnPublicId,
  removedOwnIds,
  userFolder,
} from './own-media'
import { safeTrigger, channels, events } from './pusher'
import { cityDistricts, findDistrict, type District } from '$lib/geo/districts'
import { isTravelRadius } from '$lib/geo/travel'
import { matchingFor } from '$lib/categories/matching'
import { isCrew } from '$lib/masters/meta'
import type { Prisma, Role } from '../../generated/prisma/client'
import { invalidateAccount } from './account-cache'
import { forgetMasterPage } from './master-page'
import { refreshSessionUser } from './sessions'

const PHONE_RE = /^\+380\d{9}$/
const NAME_MIN = 2
const NAME_MAX = 80
const BIO_MAX = 922
const DESC_MIN = 50
const DESC_MAX = 2000
const CATEGORIES_MAX = 5
const PORTFOLIO_MAX = 6

// * фото профілю й портфоліо — лише через own-media: своя тека в нашій хмарі

const asString = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

// * район обовʼязковий там, де в міста є райони: з нього рахуються кільця розсилки
function parseDistrict(
  districts: readonly District[],
  raw: unknown,
): string | null {
  if (districts.length === 0) return null
  const district = findDistrict(districts, asString(raw))
  if (!district) throw error(400, 'Оберіть район зі списку')
  return district.slug
}

// * CLIENT → MASTER можна, назад — ні: зниження осиротило б рейтинг і відгуки
// * й дало б спосіб скинути погану репутацію. Службові ролі тут не міняються
function assertRoleTransition(
  current: Role,
  target: 'CLIENT' | 'MASTER',
): void {
  if (current === target) return

  if (target === 'MASTER') {
    if (current === 'CLIENT') return
    throw error(403, 'Змінити роль неможливо')
  }

  if (current === 'MASTER') {
    throw error(403, 'Виконавець не може повернутися до ролі замовника')
  }
  throw error(403, 'Змінити роль неможливо')
}

/** Все, що потрібно обом формам: і на онбордингу, і на редагуванні. */
export async function loadProfileData(userId: string) {
  const [user, categories, cities, districts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
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
    // * довідники — з кешу, не з бази
    getCategories(),
    getCities(),
    getDistricts(),
  ])

  if (!user) throw error(401, 'Unauthorized')

  return {
    user,
    // * лише поля, які читають форми: решта поїхала б у payload сторінки
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
    // * райони всіх міст: зміна міста у формі не потребує нового запиту
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

export async function saveClientProfile(
  userId: string,
  body: unknown,
): Promise<void> {
  const input = (body ?? {}) as Record<string, unknown>

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, avatar: true, avatarPublicId: true },
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

  const { avatar, avatarPublicId } = acceptedAvatar(
    input.avatar,
    input.avatarPublicId,
    userId,
    { avatar: me.avatar, avatarPublicId: me.avatarPublicId },
  )

  // * старе фото з хмари — не чекаючи; лише зі своєї теки: id у старому рядку міг бути чужим
  if (
    me.avatarPublicId &&
    me.avatarPublicId !== avatarPublicId &&
    isOwnPublicId(me.avatarPublicId, userId)
  ) {
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
      avatarPublicId,
      role: 'CLIENT',
      // * ставиться лише тут, після повної валідації
      onboarded: true,
    },
  })

  await afterProfileSaved(userId)
}

export async function saveMasterProfile(
  userId: string,
  body: unknown,
): Promise<void> {
  const input = (body ?? {}) as Record<string, unknown>

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      avatar: true,
      avatarPublicId: true,
      masterProfile: {
        select: { portfolioImages: true, portfolioImagesPublicIds: true },
      },
    },
  })
  if (!me) throw error(401, 'Unauthorized')

  // * пройде і CLIENT → MASTER, і MASTER → MASTER (редагування)
  assertRoleTransition(me.role, 'MASTER')

  // * у компанії в name — її назва: окремої колонки немає
  const name = asString(input.name)
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    const label = input.crew === 'COMPANY' ? 'Назва' : 'Імʼя'
    throw error(400, `${label}: ${NAME_MIN}–${NAME_MAX} символів`)
  }

  // * username не питаємо й не пишемо; у тілі від старих збірок застосунку ігнорується

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

  // * не передали — «будь-де»
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

  // * відповіді для підбору обовʼязкові: «не відповів» означало б «отримуй усе підряд»
  if (typeof input.vehicle !== 'boolean') {
    throw error(400, 'Вкажіть, як добираєтесь на замовлення')
  }
  const hasVehicle = input.vehicle
  if (!isCrew(input.crew)) {
    throw error(400, 'Вкажіть, як ви працюєте: самі, бригадою чи компанією')
  }
  const crew = input.crew
  const rawSkills =
    input.skills && typeof input.skills === 'object'
      ? (input.skills as Record<string, unknown>)
      : {}
  const skills: Record<string, unknown> = {}
  for (const category of categories) {
    const check = matchingFor(category).validateSkills(rawSkills[category])
    if (!check) continue
    if (!check.ok) throw error(400, check.error)
    skills[category] = check.value
  }
  // * у metadata — лише вміння категорії; авто й формат роботи — колонки
  const metadata = { skills } as unknown as Prisma.InputJsonObject

  const { avatar, avatarPublicId } = acceptedAvatar(
    input.avatar,
    input.avatarPublicId,
    userId,
    { avatar: me.avatar, avatarPublicId: me.avatarPublicId },
  )

  // * приклади робіт: що вже в анкеті — лишається, нове — лише своє завантаження
  const oldPortfolio = {
    urls: me.masterProfile?.portfolioImages ?? [],
    publicIds: me.masterProfile?.portfolioImagesPublicIds ?? [],
  }
  const portfolio = acceptedPhotos(
    input.portfolioImages,
    input.portfolioImagesPublicIds,
    userFolder(userId),
    oldPortfolio,
    PORTFOLIO_MAX,
  )
  const portfolioImages = portfolio.urls
  const portfolioImagesPublicIds = portfolio.publicIds

  const [cityExists, categoriesValid] = await Promise.all([
    prisma.city.findUnique({ where: { slug: citySlug }, select: { id: true } }),
    prisma.category.count({
      where: { slug: { in: categories }, isActive: true },
    }),
  ])
  if (!cityExists) throw error(400, 'Місто не знайдено')
  if (categoriesValid !== categories.length) {
    throw error(400, 'Деякі категорії не існують')
  }

  // * стираємо з хмари лише файли з теки цієї людини, не чекаючи
  if (
    me.avatarPublicId &&
    avatarPublicId &&
    me.avatarPublicId !== avatarPublicId &&
    isOwnPublicId(me.avatarPublicId, userId)
  ) {
    cloudinary.uploader
      .destroy(me.avatarPublicId, { resource_type: 'image' })
      .catch((err) => console.error('[profile] cleanup avatar', err))
  }

  for (const id of removedOwnIds(
    oldPortfolio.publicIds,
    portfolioImagesPublicIds,
    userId,
  )) {
    cloudinary.uploader
      .destroy(id, { resource_type: 'image' })
      .catch((err) => console.error('[profile] cleanup portfolio', err))
  }

  // * роль і профіль — атомарно
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        role: 'MASTER',
        name,
        phone,
        city: citySlug,
        district,
        avatar,
        avatarPublicId,
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
        hasVehicle,
        crew,
        metadata,
        description,
        portfolioImages,
        portfolioImagesPublicIds,
        verificationStatus: 'PENDING',
        isActive: true,
      },
      update: {
        categories,
        travelRadiusKm,
        hasVehicle,
        crew,
        metadata,
        description,
        portfolioImages,
        portfolioImagesPublicIds,
        verificationStatus: 'PENDING',
        verificationRejectReason: null,
        isActive: true,
      },
    }),
  ])

  // * кожна подача — запит на (повторну) модерацію
  await safeTrigger(channels.admin, events.moderationNew, {
    name,
    resubmission: Boolean(me.masterProfile),
  })

  await afterProfileSaved(userId)
}

// * профіль записано повз better-auth — скидаємо все, що його кешує: стан
// * акаунта, копію користувача в сесіях, сторінку майстра
async function afterProfileSaved(userId: string): Promise<void> {
  await Promise.all([
    invalidateAccount(userId),
    refreshSessionUser(userId),
    forgetMasterPage(userId),
  ])
}
