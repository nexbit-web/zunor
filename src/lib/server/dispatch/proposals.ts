// Рекомендації клієнту серед відгуків на заявку: дані з БД → core/recommend.

import { cityDistricts, districtDistanceKm } from '$lib/geo/districts'
import { freshest, lastSeenMany } from '../presence'
import { getDistricts } from '../reference'
import { recommend } from './core/recommend'
import { responseRate } from './core/score'
import { prisma } from './data/db'
import { loadResponseRates } from './data/journal'
import type { MasterSignals, Recommendation } from './types'

export interface ProposalToRank {
  id: string
  createdAt: Date
  master: Omit<MasterSignals, 'responseRate' | 'distanceKm'> & {
    id: string
    city: string | null
    district: string | null
  }
}

/**
 * Позначає рекомендовані відгуки й новачків. Відзивчивість і відстань
 * рахуються тими самими функціями, що й у розсилці.
 */
export async function recommendForJob(
  job: { city: string; district: string | null },
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

  return recommend(
    proposals.map(({ id, createdAt, master }) => ({
      id,
      createdAt,
      master: {
        ...master,
        lastSeen: freshest(master.lastSeen, seen.get(master.id)),
        responseRate: rates.get(master.id) ?? responseRate(0, 0),
        // Майстер з іншого міста — відстань невідома, а не «поруч».
        distanceKm:
          master.city === job.city
            ? districtDistanceKm(districts, master.district, job.district)
            : null,
      },
    })),
    now,
  )
}
