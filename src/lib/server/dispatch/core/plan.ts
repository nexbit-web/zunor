// Рішення хвилі з готових даних: кого, скільки і в якому радіусі кликати.

import { DISPATCH_CONFIG } from '../config'
import { ringRadius, withinRadius } from './rings'
import { rankCandidates } from './score'
import { FINAL_WAVE, ageMinutes, waveAt, waveQuota } from './waves'
import type {
  Candidate,
  JobSnapshot,
  StopPlan,
  StopReason,
  WavePlan,
} from '../types'

/** Чому заявці вже не треба нікого кликати; null — треба. */
export function stopReason(
  job: Pick<JobSnapshot, 'status' | 'proposalsCount'>,
): StopReason | null {
  if (job.status !== 'OPEN') return 'job-closed'
  if (job.proposalsCount >= DISPATCH_CONFIG.ENOUGH_PROPOSALS) {
    return 'enough-proposals'
  }
  return null
}

export function stop(reason: StopReason): StopPlan {
  return { kind: 'stop', reason }
}

/**
 * Хвиля для відкритої заявки. Кільця — серед тих, кому заявка в межах
 * виїзду; остання хвиля, якщо заявку досі побачило менше
 * LAST_CALL_MIN_REACH майстрів, кличе й решту.
 */
export function planWave(
  job: JobSnapshot,
  candidates: readonly Candidate[],
  now: Date,
): WavePlan {
  const wave = waveAt(ageMinutes(job.createdAt, now))
  const slots = Math.max(0, waveQuota(wave) - job.notified.size)

  const reachable = candidates.filter((c) => c.withinReach)
  const radiusKm = ringRadius(wave, reachable, job.district !== null)
  const inRing = reachable.filter((c) => withinRadius(c, radiusKm))

  const reach = job.notified.size + Math.min(inRing.length, slots)
  const lastCall =
    wave === FINAL_WAVE &&
    reachable.length < candidates.length &&
    reach < DISPATCH_CONFIG.LAST_CALL_MIN_REACH

  return {
    kind: 'wave',
    wave,
    jobTitle: job.title,
    radiusKm,
    lastCall,
    toNotify: rankCandidates(lastCall ? candidates : inRing, now).slice(
      0,
      slots,
    ),
  }
}
