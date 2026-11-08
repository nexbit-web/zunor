// «Топ для тебе» для сторінки стрічки: обсяг і потребу в авто питаємо в
// категорії (matchingFor), рішення — чиста функція в core/fit.ts.
//
// Один шлях для SSR (dashboard/jobs) і догрузки (api/jobs/feed), як і
// masterFeedScope: інакше перша сторінка й наступні позначали б по-різному.

import { asEffort } from '$lib/categories/effort'
import { matchingFor } from '$lib/categories/matching'
import type { Crew } from '$lib/masters/meta'
import { jobFit, pickBestMatches, type FitReason } from './core/fit'

export interface FeedJobForFit {
  id: string
  category: string
  metadata: unknown
  effort: number | null
  /** Від району майстра до району заявки (jobPlace), км. */
  distanceKm: number | null
}

export interface MasterForFit {
  hasVehicle: boolean | null
  crew: Crew | null
}

/** id заявки → чому вона пасує. Немає в мапі — звичайна картка. */
export function bestMatches(
  jobs: readonly FeedJobForFit[],
  master: MasterForFit,
): Map<string, FitReason[]> {
  return pickBestMatches(
    jobs.map((j) => {
      const matching = matchingFor(j.category)
      return {
        id: j.id,
        fit: jobFit({
          distanceKm: j.distanceKm,
          hasVehicle: master.hasVehicle,
          crew: master.crew,
          // Як у розсилці: обсяг із заявки, а старша за поле — з metadata.
          effort: asEffort(j.effort) ?? matching.effort(j.metadata),
          needsVehicle: matching.needsVehicle(j.metadata),
        }),
      }
    }),
  )
}

export type { FitReason }
