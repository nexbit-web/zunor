import { json } from '@sveltejs/kit'
import type { Prisma } from '../../../../generated/prisma/client'
import { prisma } from '$lib/server/prisma'
import { forgetMasterPage } from '$lib/server/master-page'
import { refreshSessionUser } from '$lib/server/sessions'
import { limit } from '$lib/server/rate-limit'
import type { RequestHandler } from './$types'

// * старий ендпоінт «поправити кілька полів профілю»: ні сайт, ні застосунок
// * його не кличуть. З тіла ігноруються role, onboarded, avatar,
// * avatarPublicId, username; поля анкети майстра — 400: вона міняється лише
// * формою профілю, з повторною модерацією
interface UpdatePayload {
  // * поля User
  name?: string
  phone?: string
  city?: string
  bio?: string

  // * MasterProfile: лише пауза
  isActive?: boolean
}

/** Поля анкети майстра, які міняє тільки форма профілю. */
const PROFILE_ONLY = ['categories', 'description', 'submitForReview'] as const

// * ті самі межі, що в $lib/server/profile.ts
const PHONE_RE = /^\+380\d{9}$/

const LIMITS = {
  BIO_MAX: 922,
  NAME_MIN: 2,
  NAME_MAX: 80,
  CITY_MAX: 60,
} as const

// * перевірка типу: гарантує, що значення — рядок, перш ніж звертатись до
// * .length / .trim(). Без неї не-рядок (число, обʼєкт) обходив би валідацію
// * й падав уже в Prisma з 500 замість зрозумілого 400
const isString = (v: unknown): v is string => typeof v === 'string'

export const POST: RequestHandler = async ({ request, locals }) => {
  // * 401 у власному форматі { error } — див. коментар в upload/signature
  const sessionUser = locals.user
  if (!sessionUser) return json({ error: 'Unauthorized' }, { status: 401 })

  const userId = sessionUser.id

  const rl = await limit(`user-update:${userId}`, {
    points: 30,
    duration: 60_000,
  })
  if (!rl.success) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
      },
    })
  }

  let body: UpdatePayload
  try {
    body = (await request.json()) as UpdatePayload
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Invalid JSON' }, { status: 400 })
  }

  for (const field of PROFILE_ONLY) {
    if ((body as Record<string, unknown>)[field] !== undefined) {
      return json(
        { error: 'Анкету майстра змінює форма профілю' },
        { status: 400 },
      )
    }
  }

  if (body.bio !== undefined) {
    if (!isString(body.bio))
      return json({ error: 'Invalid bio' }, { status: 400 })
    if (body.bio.length > LIMITS.BIO_MAX) {
      return json({ error: 'Bio too long' }, { status: 400 })
    }
  }

  let name: string | undefined
  if (body.name !== undefined) {
    if (!isString(body.name))
      return json({ error: 'Invalid name' }, { status: 400 })
    name = body.name.trim()
    if (name.length < LIMITS.NAME_MIN || name.length > LIMITS.NAME_MAX) {
      return json({ error: 'Invalid name length' }, { status: 400 })
    }
  }

  if (body.city !== undefined) {
    if (!isString(body.city) || body.city.length > LIMITS.CITY_MAX) {
      return json({ error: 'Invalid city' }, { status: 400 })
    }
  }

  if (body.phone !== undefined) {
    if (!isString(body.phone))
      return json({ error: 'Invalid phone' }, { status: 400 })
    if (body.phone && !PHONE_RE.test(body.phone)) {
      return json({ error: 'Invalid phone' }, { status: 400 })
    }
  }

  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    return json({ error: 'Invalid isActive' }, { status: 400 })
  }

  // * роль і місто — з бази, а не із сесії (AGENTS, 2): від них залежить, чи
  // * можна чіпати анкету майстра й чи змінилось місто
  const needsMe = Boolean(body.city) || body.isActive !== undefined
  const me = needsMe
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, city: true },
      })
    : null
  if (needsMe && !me) return json({ error: 'Unauthorized' }, { status: 401 })

  // * пауза — лише в майстра: анкети клієнтові тут не створюємо
  if (body.isActive !== undefined && me?.role !== 'MASTER') {
    return json({ error: 'Forbidden' }, { status: 403 })
  }

  // * місто — лише зі списку активних. Довільний рядок тут означав би заявки
  // * «в нікуди» і стрічку майстра за вигаданим містом
  let city: string | undefined
  if (body.city) {
    const found = await prisma.city.findFirst({
      where: { slug: body.city, isActive: true },
      select: { slug: true },
    })
    if (!found) return json({ error: 'City not found' }, { status: 400 })
    city = found.slug
  }

  // * onboarded тут не ставиться: його пише лише profile.ts разом із профілем
  const userData: Prisma.UserUpdateInput = {}
  if (name) userData.name = name
  // * порожній телефон не стирає номер: за ним друга сторона замовлення
  // * звʼязується з людиною
  if (body.phone) userData.phone = body.phone
  if (city) {
    userData.city = city
    // * район належить місту: з новим містом старий район уже нічого не
    // * означає, і кільця розсилки рахувались би від чужого міста
    if (city !== me?.city) userData.district = null
  }
  if (body.bio !== undefined) userData.bio = body.bio

  if (Object.keys(userData).length > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: userData,
    })
  }

  // * updateMany, а не upsert: анкету створює лише profile.ts
  if (body.isActive !== undefined) {
    await prisma.masterProfile.updateMany({
      where: { userId },
      data: { isActive: body.isActive },
    })
  }

  // * імʼя живе і в сесіях, профіль — у кеші сторінки майстра
  await Promise.all([
    Object.keys(userData).length > 0 ? refreshSessionUser(userId) : null,
    forgetMasterPage(userId),
  ])

  return json({ ok: true })
}
