// Читання для рішення хвилі: сама заявка й майстри, яких можна покликати.

import { districtDistanceKm, type District } from '$lib/geo/districts'
import { matchingFor, meetsConditions } from '$lib/categories/matching'
import { asEffort } from '$lib/categories/effort'
import { parseMasterSkills } from '$lib/masters/meta'
import { DISPATCH_CONFIG } from '../config'
import { acceptsDistance } from '../core/rings'
import { crewFit, responseRate } from '../core/score'
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
        metadata: true,
        effort: true,
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
    // Заявка старша за Job.effort — обсяг із metadata тією ж формулою
    // (без поправки асистента: її тоді ще не було).
    effort:
      asEffort(job.effort) ?? matchingFor(job.category).effort(job.metadata),
    notified: new Set(events.map((e) => e.masterId)),
  }
}

/**
 * Майстри, яких можна покликати: місто й категорія заявки, активний
 * профіль, ще не покликані й не сам клієнт.
 *
 * Чого майстер не робить (вид прибирання, тип обʼєкта — categories/
 * matching) — відсікаємо зовсім: він сам так сказав. Межу виїзду й
 * нестачу (немає авто, а сміття треба вивезти) не відсікаємо, а
 * позначаємо (withinReach): їх переступає лише остання хвиля.
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
          hasVehicle: true,
          crew: true,
          metadata: true,
        },
      },
    },
    orderBy: { lastSeen: 'desc' },
    take: POOL_LIMIT,
  })

  const matching = matchingFor(job.category)
  const needsVehicle = matching.needsVehicle(job.metadata)

  const pool = masters.flatMap((m) => {
    const profile = m.masterProfile
    if (!profile || job.notified.has(m.id)) return []
    const skills = parseMasterSkills(profile.metadata)
    const conditions = matching.conditions(skills[job.category])
    if (!meetsConditions(job.metadata, conditions)) return []
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
    travelKm:
      m.distanceKm !== null && m.profile.hasVehicle
        ? m.distanceKm * DISPATCH_CONFIG.VEHICLE_DISTANCE_FACTOR
        : m.distanceKm,
    crewFit: crewFit(m.profile.crew, job.effort),
    withinReach:
      acceptsDistance(m.distanceKm, m.profile.travelRadiusKm ?? null) &&
      // «Немає авто» — лише явна відповідь: хто не відповідав, той не
      // втрачає заявок, яких отримував до появи питання.
      !(needsVehicle && m.profile.hasVehicle === false),
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
