// src/routes/api/jobs/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { limit } from '$lib/rate-limit'
import { Notify } from '$lib/server/notifications'
import { safeTrigger, channels } from '$lib/server/pusher'
import type { RequestHandler } from './$types'

const JOB_EXPIRES_DAYS = 7

/**
 * GET /api/jobs?role=client|master
 *
 * role=client      → мои созданные заявки (для клиента)
 * role=master      → подходящие мне заявки по категории+городу (для мастера)
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
    // Получаем профиль мастера, чтобы знать его категории и город
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
 * POST /api/jobs — создать заявку клиента и сделать broadcast мастерам.
 *
 * Body:
 *   {
 *     category: string (slug)
 *     city: string (slug)
 *     title: string
 *     description: string
 *     budgetMinUah?: number
 *     budgetMaxUah?: number
 *     attachments?: string[]      // URL после Cloudinary upload
 *     attachmentsPublicIds?: string[]
 *   }
 */
export const POST: RequestHandler = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  // Rate limit: 10 jobs / час
  const rl = limit(`job:create:${session.user.id}`, {
    points: 10,
    duration: 60 * 60_000,
  })
  if (!rl.success) throw error(429, 'Забагато заявок. Спробуйте пізніше')

  const body = await request.json().catch(() => null)
  if (!body) throw error(400, 'Invalid JSON')

  const category = String(body.category ?? '').trim()
  const city = String(body.city ?? '').trim()
  const title = String(body.title ?? '').trim()
  const description = String(body.description ?? '').trim()

  if (!category) throw error(400, 'Оберіть категорію')
  if (!city) throw error(400, 'Оберіть місто')
  if (title.length < 5 || title.length > 200) {
    throw error(400, 'Заголовок: 5-200 символів')
  }
  if (description.length < 20 || description.length > 5000) {
    throw error(400, 'Опис: 20-5000 символів')
  }

  // Бюджет (опционально)
  const budgetMinUah = body.budgetMinUah
  const budgetMaxUah = body.budgetMaxUah
  let budgetMinCents: number | null = null
  let budgetMaxCents: number | null = null

  if (budgetMinUah != null) {
    const n = Number(budgetMinUah)
    if (!Number.isFinite(n) || n < 0) throw error(400, 'Невірний бюджет')
    budgetMinCents = Math.round(n * 100)
  }
  if (budgetMaxUah != null) {
    const n = Number(budgetMaxUah)
    if (!Number.isFinite(n) || n < 0) throw error(400, 'Невірний бюджет')
    budgetMaxCents = Math.round(n * 100)
  }
  if (
    budgetMinCents != null &&
    budgetMaxCents != null &&
    budgetMinCents > budgetMaxCents
  ) {
    throw error(400, 'Мінімум більше максимуму')
  }

  // Вложения
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

  // Проверяем что категория и город существуют
  const [categoryExists, cityExists] = await Promise.all([
    prisma.category.findUnique({
      where: { slug: category },
      select: { id: true },
    }),
    prisma.city.findUnique({ where: { slug: city }, select: { id: true } }),
  ])
  if (!categoryExists) throw error(400, 'Категорію не знайдено')
  if (!cityExists) throw error(400, 'Місто не знайдено')

  const expiresAt = new Date(
    Date.now() + JOB_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  )

  // Создаём job
  const job = await prisma.job.create({
    data: {
      clientId: session.user.id,
      category,
      city,
      title,
      description,
      budgetMinCents,
      budgetMaxCents,
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

  // ─── BROADCAST: находим подходящих мастеров и шлём notification + Pusher ───
  // Не блокируем ответ клиенту — рассылка идёт асинхронно (fail-soft)
  broadcastToMasters(job).catch((err) => console.error('[job:broadcast]', err))

  return json({ job }, { status: 201 })
}

/**
 * Находит подходящих мастеров и шлёт им NEW_JOB notification + Pusher event.
 *
 * Критерии матчинга:
 *   - role = MASTER
 *   - masterProfile.isActive
 *   - masterProfile.verificationStatus = VERIFIED
 *   - User.city = job.city
 *   - masterProfile.categories содержит job.category
 *   - masterId !== clientId
 */
async function broadcastToMasters(job: {
  id: string
  title: string
  category: string
  city: string
}) {
  const masters = await prisma.user.findMany({
    where: {
      role: 'MASTER',
      city: job.city,
      masterProfile: {
        isActive: true,
        verificationStatus: 'VERIFIED',
        categories: { has: job.category },
      },
    },
    select: { id: true },
    take: 500,
  })

  if (masters.length === 0) return

  // Параллельно создаём notifications и шлём Pusher
  await Promise.all(
    masters.map(async (master) => {
      try {
        await Notify.newJob(master.id, job.id, job.title)
      } catch (err) {
        console.error(`[broadcast] notify ${master.id} failed:`, err)
      }
    }),
  )

  console.log(`[job:${job.id}] broadcast to ${masters.length} masters`)
}
