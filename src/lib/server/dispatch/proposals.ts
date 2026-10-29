// Рекомендації клієнту серед відгуків на заявку: дані з БД → core/recommend.

import { cityDistricts, districtDistanceKm } from '$lib/geo/districts'
import { asEffort } from '$lib/categories/effort'
import { matchingFor } from '$lib/categories/matching'
import type { Crew } from '$lib/masters/meta'
import { freshest, lastSeenMany } from '../presence'
import { getDistricts } from '../reference'
import { recommend } from './core/recommend'
import { DISPATCH_CONFIG } from './config'
import { crewFit, responseRate } from './core/score'
import { prisma } from './data/db'
import { loadResponseRates } from './data/journal'
import type { MasterSignals, Recommendation } from './types'

export interface ProposalToRank {
  id: string
  createdAt: Date
  master: Omit<
    MasterSignals,
    'responseRate' | 'distanceKm' | 'travelKm' | 'crewFit'
  > & {
    id: string
    city: string | null
    district: string | null
    /** Авто й формат роботи — як у розсилці; null — не відповідав. */
    hasVehicle?: boolean | null
    crew?: Crew | null
  }
}

/**
 * Позначає рекомендовані відгуки й новачків. Відзивчивість і відстань
 * рахуються тими самими функціями, що й у розсилці.
 */
export async function recommendForJob(
  job: {
    city: string
    district: string | null
    category?: string
    metadata?: unknown
    /** Job.effort; null — заявка старша за поле, рахуємо з metadata. */
    effort?: number | null
  },
  proposals: readonly ProposalToRank[],
  now: Date = new Date(),
): Promise<Recommendation> {
  if (proposals.length === 0) return recommend([], now)

  const masterIds = proposals.map((p) => p.master.id)
  const [rates, allDistricts, seen] = await Promise.all([
    loadResponseRates(prisma, masterIds),
    getDistricts(),
    lastSeenMany(masterIds),
  ])
  const districts = cityDistricts(allDistricts, job.city)
  const effort =
    asEffort(job.effort) ??
    (job.category ? matchingFor(job.category).effort(job.metadata) : null)

  return recommend(
    proposals.map(
      ({ id, createdAt, master: { hasVehicle, crew, ...master } }) => {
        // Майстер з іншого міста — відстань невідома, а не «поруч».
        const distanceKm =
          master.city === job.city
            ? districtDistanceKm(districts, master.district, job.district)
            : null
        return {
          id,
          createdAt,
          master: {
            ...master,
            lastSeen: freshest(master.lastSeen, seen.get(master.id)),
            responseRate: rates.get(master.id) ?? responseRate(0, 0),
            distanceKm,
            travelKm:
              distanceKm !== null && hasVehicle
                ? distanceKm * DISPATCH_CONFIG.VEHICLE_DISTANCE_FACTOR
                : distanceKm,
            crewFit: crewFit(crew, effort),
          },
        }
      },
    ),
    now,
  )
}
