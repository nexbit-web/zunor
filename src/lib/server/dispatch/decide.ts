// Рішення хвилі для заявки: тут лише читання, вирішує чисте ядро
// (core/plan.ts). Нічого не пише й нікого не сповіщає.

import { cityDistricts, findDistrict } from '$lib/geo/districts'
import { getDistricts } from '../reference'
import { planWave, stop, stopReason } from './core/plan'
import { loadCandidates, loadJob } from './data/candidates'
import { prisma, type Db } from './data/db'
import type { DispatchDecision } from './types'

export async function decide(
  jobId: string,
  db: Db = prisma,
  now: Date = new Date(),
): Promise<DispatchDecision> {
  const job = await loadJob(db, jobId)
  if (!job) return stop('job-closed')

  const reason = stopReason(job)
  if (reason) return stop(reason)

  // Довідник — із кешу, а не з транзакції: райони не є станом заявки.
  // Вимкнений у довіднику район — те саме, що без району.
  const districts = cityDistricts(await getDistricts(), job.city)
  const located = {
    ...job,
    district: findDistrict(districts, job.district)?.slug ?? null,
  }

  const candidates = await loadCandidates(db, located, districts, now)
  return planWave(located, candidates, now)
}
