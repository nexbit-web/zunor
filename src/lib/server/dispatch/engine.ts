// src/lib/server/dispatch/engine.ts
//
// Мозок-диспетчер. Читає стан заявки + кандидатів, вирішує кого
// уведомити в поточній хвилі. Сам НЕ відправляє — повертає рішення.
// Відправку робить index.ts (щоб тут не було залежності від Pusher).

import { prisma } from '$lib/prisma'
import { scoreAll } from './scoring'
import { DISPATCH_CONFIG } from './types'
import type { Candidate, JobContext, DispatchDecision } from './types'

/**
 * Визначає номер поточної хвилі за віком заявки.
 * Хвиля 1 одразу, хвиля 2 через 2 хв, хвиля 3 через 10 хв.
 */
function currentWave(jobAgeMinutes: number): number {
  const waves = DISPATCH_CONFIG.WAVES
  let wave = 1
  for (let i = 0; i < waves.length; i++) {
    if (jobAgeMinutes >= waves[i].afterMinutes) wave = i + 1
  }
  return wave
}

/** Сумарний batchSize до поточної хвилі включно (скільки всього маємо уведомити). */
function cumulativeBatchSize(wave: number): number {
  return DISPATCH_CONFIG.WAVES.slice(0, wave).reduce(
    (sum, w) => sum + w.batchSize,
    0,
  )
}

/**
 * Збирає контекст заявки: статус, к-сть відгуків, хто вже уведомлений.
 */
async function loadJobContext(jobId: string): Promise<{
  context: JobContext
  category: string
  city: string
  clientId: string
  status: string
} | null> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      category: true,
      city: true,
      clientId: true,
      status: true,
      proposalsCount: true,
      createdAt: true,
    },
  })
  if (!job) return null

  const dispatched = await prisma.dispatchEvent.findMany({
    where: { jobId },
    select: { masterId: true },
  })

  return {
    context: {
      jobId: job.id,
      proposalsCount: job.proposalsCount,
      createdAt: job.createdAt,
      alreadyNotified: new Set(dispatched.map((d) => d.masterId)),
    },
    category: job.category,
    city: job.city,
    clientId: job.clientId,
    status: job.status,
  }
}

/**
 * Завантажує кандидатів-майстрів для заявки.
 * Усі активні майстри категорії+міста, КРІМ клієнта і вже уведомлених.
 */
async function loadCandidates(
  category: string,
  city: string,
  clientId: string,
  alreadyNotified: Set<string>,
): Promise<Candidate[]> {
  const masters = await prisma.user.findMany({
    where: {
      role: 'MASTER',
      city,
      id: { not: clientId },
      masterProfile: {
        isActive: true,
        categories: { has: category },
      },
    },
    select: {
      id: true,
      isOnline: true,
      lastSeen: true,
      avgRating: true,
      masterProfile: {
        select: {
          verificationStatus: true,
          completedOrders: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          masterOrders: {
            where: { status: { in: ['CREATED', 'IN_PROGRESS'] } },
          },
        },
      },
    },
    take: 500,
  })

  return masters
    .filter((m) => !alreadyNotified.has(m.id) && m.masterProfile)
    .map((m) => ({
      id: m.id,
      isOnline: m.isOnline,
      lastSeen: m.lastSeen,
      avgRating: m.avgRating,
      isVerified: m.masterProfile!.verificationStatus === 'VERIFIED',
      activeOrders: m._count.masterOrders,
      masterSince: m.masterProfile!.createdAt,
      completedOrders: m.masterProfile!.completedOrders,
    }))
}

/**
 * ГОЛОВНА ФУНКЦІЯ МОЗКУ.
 * Вирішує, кого уведомити для заявки в поточний момент.
 */
export async function decide(jobId: string): Promise<DispatchDecision> {
  const loaded = await loadJobContext(jobId)

  // Заявка зникла
  if (!loaded) {
    return {
      shouldDispatch: false,
      stopReason: 'job-closed',
      wave: 0,
      toNotify: [],
    }
  }

  const { context, category, city, clientId, status } = loaded

  // Заявка вже не приймає відгуки
  if (status !== 'OPEN') {
    return {
      shouldDispatch: false,
      stopReason: 'job-closed',
      wave: 0,
      toNotify: [],
    }
  }

  // Досить відгуків — припиняємо спам
  if (context.proposalsCount >= DISPATCH_CONFIG.ENOUGH_PROPOSALS) {
    return {
      shouldDispatch: false,
      stopReason: 'enough-proposals',
      wave: 0,
      toNotify: [],
    }
  }

  // Кандидати (без вже уведомлених)
  const candidates = await loadCandidates(
    category,
    city,
    clientId,
    context.alreadyNotified,
  )

  if (candidates.length === 0) {
    return {
      shouldDispatch: false,
      stopReason: 'no-candidates',
      wave: 0,
      toNotify: [],
    }
  }

  // Яка зараз хвиля + скільки всього маємо уведомити
  const ageMinutes = (Date.now() - context.createdAt.getTime()) / 60000
  const wave = currentWave(ageMinutes)
  const targetTotal = cumulativeBatchSize(wave)

  // Скільки ще можна уведомити (вже уведомлено alreadyNotified.size)
  const remainingSlots = Math.max(0, targetTotal - context.alreadyNotified.size)
  if (remainingSlots === 0) {
    return { shouldDispatch: false, wave, toNotify: [] }
  }

  // Score + сортування + обрізаємо до доступних слотів
  const scored = scoreAll(candidates).slice(0, remainingSlots)

  return {
    shouldDispatch: scored.length > 0,
    wave,
    toNotify: scored,
  }
}
