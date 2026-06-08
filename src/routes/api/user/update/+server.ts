// src/routes/api/user/update/+server.ts
import { json } from '@sveltejs/kit'
import {
  Prisma,
  VerificationStatus,
  Role,
} from '../../../../generated/prisma/client'
import { prisma } from '$lib/prisma'
import { auth } from '$lib/auth'
import type { RequestHandler } from './$types'

interface UpdatePayload {
  // ─── Поля User ───
  role?: 'CLIENT' | 'MASTER'
  username?: string
  name?: string
  phone?: string
  city?: string
  bio?: string
  avatar?: string | null
  avatarPublicId?: string | null

  // ─── Поля MasterProfile ───
  categories?: string[]
  description?: string
  isActive?: boolean

  // ─── Дія: відправити профіль на модерацію ───
  submitForReview?: boolean
}

const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/
const SLUG_RE = /^[a-z0-9-]{1,80}$/
const PHONE_RE = /^[\d\s+()-]{8,20}$/

const RESERVED = new Set([
  'admin',
  'root',
  'api',
  'support',
  'help',
  'zunor',
  'system',
  'user',
  'users',
  'profile',
  'dashboard',
  'settings',
  'login',
  'register',
  'signup',
  'logout',
  'moderation',
  'verified',
  'null',
  'undefined',
  'anonymous',
])

const LIMITS = {
  BIO_MAX: 922,
  NAME_MAX: 80,
  CITY_MAX: 60,
  CATEGORIES_MAX: 10,
  DESCRIPTION_MAX: 2000,
} as const

// Перевірка типу: гарантує, що значення — рядок, перш ніж звертатись до
// .length / .trim(). Без неї не-рядок (число, обʼєкт) обходив би валідацію
// й падав уже в Prisma з 500 замість зрозумілого 400.
const isString = (v: unknown): v is string => typeof v === 'string'

export const POST: RequestHandler = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 })

  let body: UpdatePayload
  try {
    body = (await request.json()) as UpdatePayload
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const userId = session.user.id

  // ═══════════════════ Валідація ═══════════════════

  if (body.role && !['CLIENT', 'MASTER'].includes(body.role)) {
    return json({ error: 'Invalid role' }, { status: 400 })
  }

  if (body.bio !== undefined) {
    if (!isString(body.bio))
      return json({ error: 'Invalid bio' }, { status: 400 })
    if (body.bio.length > LIMITS.BIO_MAX) {
      return json({ error: 'Bio too long' }, { status: 400 })
    }
  }

  if (body.name !== undefined) {
    if (!isString(body.name))
      return json({ error: 'Invalid name' }, { status: 400 })
    if (body.name.length < 1 || body.name.length > LIMITS.NAME_MAX) {
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

  if (body.description !== undefined) {
    if (!isString(body.description)) {
      return json({ error: 'Invalid description' }, { status: 400 })
    }
    if (body.description.length > LIMITS.DESCRIPTION_MAX) {
      return json({ error: 'Description too long' }, { status: 400 })
    }
  }

  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    return json({ error: 'Invalid isActive' }, { status: 400 })
  }

  // Аватар: рядок або null (скидання). Не-рядок → 400, а не падіння в Prisma.
  if (
    body.avatar !== undefined &&
    body.avatar !== null &&
    !isString(body.avatar)
  ) {
    return json({ error: 'Invalid avatar' }, { status: 400 })
  }
  if (
    body.avatarPublicId !== undefined &&
    body.avatarPublicId !== null &&
    !isString(body.avatarPublicId)
  ) {
    return json({ error: 'Invalid avatar id' }, { status: 400 })
  }

  // ─── Категорії — масив slug'ів ───
  if (body.categories !== undefined) {
    if (
      !Array.isArray(body.categories) ||
      body.categories.length > LIMITS.CATEGORIES_MAX
    ) {
      return json({ error: 'Invalid categories' }, { status: 400 })
    }
    if (!body.categories.every((c) => isString(c) && SLUG_RE.test(c))) {
      return json({ error: 'Invalid category slug' }, { status: 400 })
    }
  }

  // ─── Username ───
  if (body.username !== undefined) {
    if (!isString(body.username)) {
      return json(
        { error: 'Invalid username format', field: 'username' },
        { status: 400 },
      )
    }
    const u = body.username.trim().toLowerCase()
    if (!USERNAME_RE.test(u)) {
      return json(
        { error: 'Invalid username format', field: 'username' },
        { status: 400 },
      )
    }
    if (RESERVED.has(u)) {
      return json(
        { error: 'Username is reserved', field: 'username' },
        { status: 400 },
      )
    }
    body.username = u
  }

  // ─── Перевіряємо, що всі вказані категорії існують ───
  if (body.categories !== undefined && body.categories.length > 0) {
    const found = await prisma.category.count({
      where: { slug: { in: body.categories }, isActive: true },
    })
    if (found !== body.categories.length) {
      return json({ error: 'Some categories not found' }, { status: 400 })
    }
  }

  // ═══════════════════ Оновлення User ═══════════════════

  const userData: Prisma.UserUpdateInput = {}
  if (body.role) userData.role = body.role as Role
  if (body.name) userData.name = body.name
  if (body.phone !== undefined) userData.phone = body.phone
  if (body.city) userData.city = body.city
  if (body.bio !== undefined) userData.bio = body.bio
  if (body.username !== undefined) userData.username = body.username
  if (body.avatar !== undefined) userData.avatar = body.avatar
  if (body.avatarPublicId !== undefined)
    userData.avatarPublicId = body.avatarPublicId

  if (Object.keys(userData).length > 0) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: userData,
      })
    } catch (err) {
      // Унікальний username уже зайнятий — віддаємо зрозумілий 409, а не 500
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return json(
          { error: 'Username already taken', field: 'username' },
          { status: 409 },
        )
      }
      throw err
    }
  }

  // ═══════════════════ Upsert MasterProfile ═══════════════════

  const hasMasterData =
    body.categories !== undefined ||
    body.description !== undefined ||
    body.isActive !== undefined ||
    body.submitForReview === true

  if (hasMasterData) {
    const scalarUpdate: Prisma.MasterProfileUpdateInput = {}

    if (body.categories !== undefined) scalarUpdate.categories = body.categories
    if (body.description !== undefined)
      scalarUpdate.description = body.description
    if (body.isActive !== undefined) scalarUpdate.isActive = body.isActive

    if (body.submitForReview === true) {
      scalarUpdate.verificationStatus = VerificationStatus.PENDING
      scalarUpdate.verificationRejectReason = null
    }

    const scalarCreate: Prisma.MasterProfileUncheckedCreateInput = {
      userId,
      ...(body.categories !== undefined && { categories: body.categories }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.submitForReview === true && {
        verificationStatus: VerificationStatus.PENDING,
      }),
    }

    await prisma.masterProfile.upsert({
      where: { userId },
      create: scalarCreate,
      update: scalarUpdate,
      select: { id: true },
    })
  }

  return json({ ok: true })
}
