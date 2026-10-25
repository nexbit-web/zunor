// Читання для рішення хвилі: сама заявка й майстри, яких можна покликати.

import { districtDistanceKm, type District } from '$lib/geo/districts'
import { DISPATCH_CONFIG } from '../config'
import { acceptsDistance } from '../core/rings'
import { responseRate } from '../core/score'
import { freshest, lastSeenMany } from '../../presence'
import { loadHistory } from './journal'
import type { Db } from './db'
import type { Candidate, JobSnapshot } from '../types'

/** Стеля пулу в памʼяті процесу. Беремо найсвіжіших — вони ймовірно онлайн. */
const POOL_LIMIT = 500

const BUSY_ORDER_STATUSES = ['CREATED', 'IN_PROGRESS'] as const

export async function loadJob(
  db: Db,
  jobId: string,
): Promise<JobSnapshot | null> {
  const [job, events] = await Promise.all([
    db.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        category: true,
        city: true,
        district: true,
        clientId: true,
        status: true,
        proposalsCount: true,
        createdAt: true,
        dispatchWave: true,
      },
    }),
    db.dispatchEvent.findMany({
      where: { jobId },
      select: { masterId: true },
    }),
  ])
  if (!job) return null

  return {
    ...job,
    district: job.district ?? null,
    notified: new Set(events.map((e) => e.masterId)),
  }
}

/**
 * Майстри, яких можна покликати: місто й послуга заявки, активний
 * профіль, ще не покликані й не сам клієнт. Межу виїзду не відсікаємо, а
 * позначаємо (withinReach): переступити її може остання хвиля.
 */
export async function loadCandidates(
  db: Db,
  job: JobSnapshot,
  districts: readonly District[],
  now: Date,
): Promise<Candidate[]> {
  const masters = await db.user.findMany({
    where: {
      role: 'MASTER',
      city: job.city,
      id: { not: job.clientId },
      masterProfile: {
        isActive: true,
        categories: { has: job.category },
      },
    },
    select: {
      id: true,
      lastSeen: true,
      avgRatingAsMaster: true,
      district: true,
      masterProfile: {
        select: {
          verificationStatus: true,
          completedOrders: true,
          createdAt: true,
          travelRadiusKm: true,
        },
      },
    },
    orderBy: { lastSeen: 'desc' },
    take: POOL_LIMIT,
  })

  const pool = masters.flatMap((m) => {
    const profile = m.masterProfile
    if (!profile || job.notified.has(m.id)) return []
    const distanceKm = districtDistanceKm(districts, m.district, job.district)
    return [{ ...m, profile, distanceKm }]
  })
  if (pool.length === 0) return []

  const ids = pool.map((m) => m.id)
  const since = new Date(
    now.getTime() - DISPATCH_CONFIG.RECENT_LOAD_WINDOW_MIN * 60_000,
  )
  const [busy, history, seen] = await Promise.all([
    countBusyOrders(db, ids),
    loadHistory(db, ids, since),
    // Точний «онлайн» — з Redis; у базі він грубий (presence.ts).
    lastSeenMany(ids),
  ])

  return pool.map((m) => ({
    id: m.id,
    lastSeen: freshest(m.lastSeen, seen.get(m.id)),
    avgRating: m.avgRatingAsMaster,
    isVerified: m.profile.verificationStatus === 'VERIFIED',
    activeOrders: busy.get(m.id) ?? 0,
    masterSince: m.profile.createdAt,
    completedOrders: m.profile.completedOrders,
    responseRate: history.get(m.id)?.responseRate ?? responseRate(0, 0),
    recentNotifications: history.get(m.id)?.recent ?? 0,
    distanceKm: m.distanceKm,
    withinReach: acceptsDistance(
      m.distanceKm,
      m.profile.travelRadiusKm ?? null,
    ),
  }))
}

async function countBusyOrders(
  db: Db,
  masterIds: readonly string[],
): Promise<Map<string, number>> {
  const rows = await db.order.groupBy({
    by: ['masterId'],
    where: {
      masterId: { in: [...masterIds] },
      status: { in: [...BUSY_ORDER_STATUSES] },
    },
    _count: { _all: true },
  })
  return new Map(rows.map((r) => [r.masterId, r._count._all]))
}
