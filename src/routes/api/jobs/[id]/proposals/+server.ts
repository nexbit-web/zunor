// src/routes/api/jobs/[id]/proposals/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/server/auth'
import { prisma } from '$lib/server/prisma'
import { limit } from '$lib/server/rate-limit'
import { Notify } from '$lib/server/notifications'
import { markResponded } from '$lib/server/dispatch'
import type { RequestHandler } from './$types'

/**
 * POST /api/jobs/[id]/proposals — майстер надсилає відгук.
 *
 * Body: { message: string, priceUah: number, estimatedDays: number }
 * Безкоштовно (lead fee прибрано).
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const rl = limit(`proposal:${session.user.id}`, {
    points: 30,
    duration: 60 * 60_000,
  })
  if (!rl.success) throw error(429, 'Забагато відгуків')

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      city: true,
      masterProfile: { select: { isActive: true, categories: true } },
    },
  })
  if (!me || me.role !== 'MASTER') {
    throw error(403, 'Тільки майстри можуть відгукуватись')
  }
  if (!me.masterProfile?.isActive) {
    throw error(403, 'Ваш профіль зараз неактивний')
  }

  const body = await request.json().catch(() => null)
  if (!body) throw error(400, 'Invalid JSON')

  const message = String(body.message ?? '').trim()
  const priceUah = Number(body.priceUah)
  const estimatedDays = Number(body.estimatedDays)

  if (message.length < 20)
    throw error(400, 'Повідомлення занадто коротке (мін. 20 символів)')
  if (message.length > 2000) throw error(400, 'Повідомлення занадто довге')
  if (!Number.isFinite(priceUah) || priceUah <= 0)
    throw error(400, 'Вкажіть ціну')
  if (priceUah < 50 || priceUah > 500_000)
    throw error(400, 'Ціна: 50-500 000 грн')
  if (
    !Number.isInteger(estimatedDays) ||
    estimatedDays < 1 ||
    estimatedDays > 180
  ) {
    throw error(400, 'Термін: 1-180 днів')
  }

  const priceCents = Math.round(priceUah * 100)

  const job = await prisma.job.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      clientId: true,
      status: true,
      expiresAt: true,
      title: true,
      category: true,
      city: true,
    },
  })

  if (!job) throw error(404, 'Заявку не знайдено')
  if (job.clientId === session.user.id)
    throw error(400, 'Не можна відгукнутись на свою заявку')
  if (job.status !== 'OPEN')
    throw error(400, 'Заявка більше не приймає відгуки')
  if (job.expiresAt < new Date()) throw error(400, 'Термін подачі минув')

  // Право на відгук перевіряємо на сервері (та сама умова, що в стрічці й гейті
  // перегляду) — не покладаємось на те, що UI ховає кнопку.
  if (me.city !== job.city) {
    throw error(403, 'Заявка не у вашому місті')
  }
  if (!me.masterProfile.categories.includes(job.category)) {
    throw error(403, 'Ця категорія не у вашому профілі')
  }

  // Повторний відгук неможливий (унікальний ключ jobId+masterId).
  const existing = await prisma.proposal.findUnique({
    where: { jobId_masterId: { jobId: job.id, masterId: session.user.id } },
    select: { id: true },
  })
  if (existing) {
    throw error(400, 'Ви вже відправили відгук на цю заявку')
  }

  // Створення відгуку + інкремент лічильника — атомарно.
  const proposal = await prisma.$transaction(async (tx) => {
    const created = await tx.proposal.create({
      data: {
        jobId: job.id,
        masterId: session.user.id,
        message,
        priceCents,
        estimatedDays,
        status: 'SENT',
      },
      select: {
        id: true,
        message: true,
        priceCents: true,
        estimatedDays: true,
        status: true,
        createdAt: true,
      },
    })

    await tx.job.update({
      where: { id: job.id },
      data: { proposalsCount: { increment: 1 } },
    })

    return created
  })

  // Сповіщення клієнту — fail-soft: збій нотифікації не валить створення відгуку.
  try {
    await Notify.newProposal(job.clientId, job.id, proposal.id)
  } catch (err) {
    console.error('[proposal:new] notify failed', err)
  }

  // Память диспетчера: майстер відповів на розіслану заявку — ключова метрика
  // якості розсилки (хто з уведомлених реально відгукнувся).
  markResponded(job.id, session.user.id).catch(() => {})

  return json({ proposal }, { status: 201 })
}

/**
 * GET /api/jobs/[id]/proposals — усі відгуки на заявку.
 * Доступ: лише власник заявки.
 */
export const GET: RequestHandler = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const job = await prisma.job.findUnique({
    where: { id: params.id },
    select: { id: true, clientId: true },
  })
  if (!job) throw error(404, 'Не знайдено')
  if (job.clientId !== session.user.id) throw error(403, 'Доступ заборонено')

  const proposals = await prisma.proposal.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      message: true,
      priceCents: true,
      estimatedDays: true,
      status: true,
      createdAt: true,
      master: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          city: true,
          avgRating: true,
          reviewsCount: true,
          masterProfile: {
            select: {
              verificationStatus: true,
              completedOrders: true,
            },
          },
        },
      },
    },
  })

  return json({ proposals })
}
