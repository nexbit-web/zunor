// Мозок-диспетчер. Читає стан заявки + кандидатів, вирішує кого
// уведомити в поточній хвилі. Сам НЕ відправляє — повертає рішення.
// Відправку робить index.ts (щоб тут не було залежності від Pusher).
//
// Усі читання приймають клієнт `db`: глобальний prisma або tx у межах
// advisory-лока (index.ts), щоб рішення й claim були в одній серіалізованій транзакції.

import { prisma } from '../prisma'
import { scoreAll, responseRate } from './scoring'
import { DISPATCH_CONFIG } from './types'
import type { Candidate, JobContext, DispatchDecision } from './types'

/** Клієнт Prisma або транзакційний клієнт — будь-який підходить для читань. */
export type Db = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

/** Активні статуси замовлення (майстер зайнятий). */
const ACTIVE_ORDER_STATUSES = ['CREATED', 'IN_PROGRESS'] as const

/** Скільки кандидатів максимум тягнемо в пам'ять для scoring. */
const CANDIDATE_POOL_LIMIT = 500

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

/** Збирає контекст заявки: статус, к-сть відгуків, хто вже уведомлений. */
async function loadJobContext(
  db: Db,
  jobId: string,
): Promise<{
  context: JobContext
  category: string
  city: string
  clientId: string
  status: string
} | null> {
  const job = await db.job.findUnique({
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

  const dispatched = await db.dispatchEvent.findMany({
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
 *
 * Оптимізація: тягнемо тонкий зріз майстрів (без коррельованих підзапитів),
 * а активні замовлення, відзивчивість і недавню нагрузку рахуємо ОДНИМ
 * groupBy на весь пул кожне — замість N підзапитів.
 */
async function loadCandidates(
  db: Db,
  category: string,
  city: string,
  clientId: string,
  alreadyNotified: Set<string>,
): Promise<Candidate[]> {
  const masters = await db.user.findMany({
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
      avgRatingAsMaster: true,
      masterProfile: {
        select: {
          verificationStatus: true,
          completedOrders: true,
          createdAt: true,
        },
      },
    },
    // Свіжіші (ймовірно онлайн) — першими, щоб під лімітом пулу не втратити їх.
    orderBy: { lastSeen: 'desc' },
    take: CANDIDATE_POOL_LIMIT,
  })

  const pool = masters.filter(
    (m) => !alreadyNotified.has(m.id) && m.masterProfile,
  )
  if (pool.length === 0) return []

  const ids = pool.map((m) => m.id)
  const recentCutoff = new Date(
    Date.now() - DISPATCH_CONFIG.RECENT_LOAD_WINDOW_MIN * 60_000,
  )

  // Усі агрегати — паралельно, по індексованих полях ([masterId,...]).
  const [activeAgg, notifiedAgg, respondedAgg, recentAgg] = await Promise.all([
    db.order.groupBy({
      by: ['masterId'],
      where: {
        masterId: { in: ids },
        status: { in: [...ACTIVE_ORDER_STATUSES] },
      },
      _count: { _all: true },
    }),
    db.dispatchEvent.groupBy({
      by: ['masterId'],
      where: { masterId: { in: ids } },
      _count: { _all: true },
    }),
    db.dispatchEvent.groupBy({
      by: ['masterId'],
      where: { masterId: { in: ids }, respondedAt: { not: null } },
      _count: { _all: true },
    }),
    db.dispatchEvent.groupBy({
      by: ['masterId'],
      where: { masterId: { in: ids }, notifiedAt: { gt: recentCutoff } },
      _count: { _all: true },
    }),
  ])

  const activeMap = new Map(activeAgg.map((r) => [r.masterId, r._count._all]))
  const notifiedMap = new Map(
    notifiedAgg.map((r) => [r.masterId, r._count._all]),
  )
  const respondedMap = new Map(
    respondedAgg.map((r) => [r.masterId, r._count._all]),
  )
  const recentMap = new Map(recentAgg.map((r) => [r.masterId, r._count._all]))

  return pool.map((m) => ({
    id: m.id,
    isOnline: m.isOnline,
    lastSeen: m.lastSeen,
    avgRating: m.avgRatingAsMaster,
    isVerified: m.masterProfile!.verificationStatus === 'VERIFIED',
    activeOrders: activeMap.get(m.id) ?? 0,
    masterSince: m.masterProfile!.createdAt,
    completedOrders: m.masterProfile!.completedOrders,
    responseRate: responseRate(
      notifiedMap.get(m.id) ?? 0,
      respondedMap.get(m.id) ?? 0,
    ),
    recentNotifications: recentMap.get(m.id) ?? 0,
  }))
}

/**
 * ГОЛОВНА ФУНКЦІЯ МОЗКУ.
 * Вирішує, кого уведомити для заявки в поточний момент. Лише читає, не пише.
 * `db` за замовчуванням глобальний; index.ts передає tx у межах advisory-лока.
 */
export async function decide(
  jobId: string,
  db: Db = prisma,
): Promise<DispatchDecision> {
  const loaded = await loadJobContext(db, jobId)

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

  const candidates = await loadCandidates(
    db,
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
