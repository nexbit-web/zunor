// src/routes/api/jobs/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { limit } from '$lib/rate-limit'
import { dispatchJob } from '$lib/server/dispatch'
import { CATEGORY_SLUG } from '$lib/categories/cleaning/presets'
import { validateCleaningMetadata } from '$lib/categories/cleaning/validate'
import { generateTitle } from '$lib/categories/cleaning/title-gen'
import type { RequestHandler } from './$types'

const JOB_EXPIRES_DAYS = 7

/**
 * GET /api/jobs?role=client|master
 */
export const GET: RequestHandler = async ({ request, url }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const role = url.searchParams.get('role') ?? 'client'

  if (role === 'client') {
    const jobs = await prisma.job.findMany({
      where: { clientId: session.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        city: true,
        status: true,
        budgetMinCents: true,
        budgetMaxCents: true,
        currency: true,
        proposalsCount: true,
        expiresAt: true,
        createdAt: true,
      },
      take: 100,
    })
    return json({ jobs })
  }

  if (role === 'master') {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        city: true,
        role: true,
        masterProfile: {
          select: {
            categories: true,
            isActive: true,
            verificationStatus: true,
          },
        },
      },
    })

    if (!me || me.role !== 'MASTER') {
      throw error(403, 'Доступ тільки для майстрів')
    }
    if (!me.masterProfile?.isActive) {
      return json({ jobs: [] })
    }
    if (!me.city || me.masterProfile.categories.length === 0) {
      return json({ jobs: [] })
    }

    const jobs = await prisma.job.findMany({
      where: {
        status: 'OPEN',
        city: me.city,
        category: { in: me.masterProfile.categories },
        clientId: { not: session.user.id },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        city: true,
        budgetMinCents: true,
        budgetMaxCents: true,
        currency: true,
        attachments: true,
        proposalsCount: true,
        createdAt: true,
        expiresAt: true,
        client: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            avgRating: true,
            reviewsCount: true,
          },
        },
      },
      take: 100,
    })

    return json({ jobs })
  }

  throw error(400, 'Невідомий role')
}

/**
 * POST /api/jobs — створити заявку на прибирання + запустити dispatch.
 *
 * Body: { metadata: { premise, service, size?, when }, note?, attachments? }
 *
 * Категорія фіксована (прибирання). Title генерується з metadata.
 * Місто — з профілю клієнта (fallback Одеса). Бюджет не питаємо.
 */
export const POST: RequestHandler = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const rl = limit(`job:create:${session.user.id}`, {
    points: 10,
    duration: 60 * 60_000,
  })
  if (!rl.success) throw error(429, 'Забагато заявок. Спробуйте пізніше')

  const body = await request.json().catch(() => null)
  if (!body) throw error(400, 'Invalid JSON')

  // Валідація metadata через конфіг прибирання
  const validation = validateCleaningMetadata(body.metadata)
  if (!validation.ok || !validation.clean) {
    throw error(400, validation.error ?? 'Некоректні дані заявки')
  }
  const metadata = validation.clean

  // Title генерується автоматично
  const title = generateTitle(metadata)

  // Замітка клієнта (опціонально)
  const note =
    typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : ''

  // Вкладення (опціонально)
  const attachments = Array.isArray(body.attachments)
    ? body.attachments
        .filter((s: unknown) => typeof s === 'string')
        .slice(0, 10)
    : []
  const attachmentsPublicIds = Array.isArray(body.attachmentsPublicIds)
    ? body.attachmentsPublicIds
        .filter((s: unknown) => typeof s === 'string')
        .slice(0, 10)
    : []

  // Місто: з профілю клієнта, fallback Одеса
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { city: true },
  })
  const city = me?.city || 'odesa'

  const [categoryExists, cityExists] = await Promise.all([
    prisma.category.findUnique({
      where: { slug: CATEGORY_SLUG },
      select: { id: true },
    }),
    prisma.city.findUnique({ where: { slug: city }, select: { id: true } }),
  ])
  if (!categoryExists) throw error(500, 'Категорію прибирання не налаштовано')
  if (!cityExists) throw error(400, 'Місто не знайдено')

  const expiresAt = new Date(
    Date.now() + JOB_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  )

  const job = await prisma.job.create({
    data: {
      clientId: session.user.id,
      category: CATEGORY_SLUG,
      city,
      title,
      description: note || null,
      metadata: metadata as unknown as object,
      currency: 'UAH',
      attachments,
      attachmentsPublicIds,
      status: 'OPEN',
      expiresAt,
    },
    select: {
      id: true,
      title: true,
      category: true,
      city: true,
      createdAt: true,
    },
  })

  // DISPATCH: мозок вирішує кого уведомити (хвиля 1)
  dispatchJob(job.id, job.title).catch((err) =>
    console.error('[job:dispatch]', err),
  )

  return json({ job }, { status: 201 })
}
