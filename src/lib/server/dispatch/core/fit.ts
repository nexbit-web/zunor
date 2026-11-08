// Наскільки заявка пасує майстрові — для позначки «Топ для тебе» у
// стрічці.
//
// Не окрема формула, а ті самі складові, що й у розсилці (score.ts):
// відстань у часі дороги, формат роботи під обсяг і авто для вивозу.
// Якість самого майстра (рейтинг, онлайн) тут ні до чого — для одного
// майстра вона однакова на всіх заявках і нічого між ними не розрізняє.
//
// «Топ» = розсилка покликала б його першою хвилею й без штрафу:
// заявка в першому кільці від його району, формат роботи не проти
// обсягу, а якщо треба вивезти сміття — авто є.

import type { Crew } from '$lib/masters/meta'
import { DISPATCH_CONFIG } from '../config'
import { crewFit, proximityBonus } from './score'

/** Чому заявка пасує — для підпису під назвою в картці. */
export type FitReason = 'near' | 'crew' | 'vehicle'

export interface FitInput {
  /** Від району майстра до району заявки, км; null — невідомо. */
  distanceKm: number | null
  hasVehicle: boolean | null
  crew: Crew | null
  /** Обсяг заявки 1–10; null — категорія його не рахує. */
  effort: number | null
  needsVehicle: boolean
}

export interface JobFit {
  /** Для вибору найкращих серед підхожих: близькість + формат. */
  score: number
  best: boolean
  reasons: FitReason[]
}

/** Перше кільце розсилки: ближчих розсилка кличе одразу. */
const FIRST_RING_KM = DISPATCH_CONFIG.WAVES[0].radiusKm ?? 0

export function jobFit(input: FitInput): JobFit {
  // Як у кільцях: з авто відстань міряємо в часі дороги.
  const travel =
    input.distanceKm === null
      ? null
      : input.hasVehicle
        ? input.distanceKm * DISPATCH_CONFIG.VEHICLE_DISTANCE_FACTOR
        : input.distanceKm
  const crew = crewFit(input.crew, input.effort)

  // Невідома відстань — не «поруч»: як і в розсилці, невідомо ≠ близько.
  const near = travel !== null && travel <= FIRST_RING_KM
  // «Немає авто» — лише явна відповідь, як і у відсіві розсилки.
  const vehicleOk = !input.needsVehicle || input.hasVehicle !== false
  const hasCar = input.needsVehicle && input.hasVehicle === true

  const reasons: FitReason[] = []
  if (near) reasons.push('near')
  if (crew > 0) reasons.push('crew')
  if (hasCar) reasons.push('vehicle')

  return {
    score: proximityBonus(travel) + crew,
    best: near && crew >= 0 && vehicleOk,
    reasons,
  }
}

/**
 * Які з заявок сторінки позначити. Лише підхожі й не більше
 * BEST_MATCH_LIMIT із найвищим балом: позначка на кожній другій картці
 * нічого б не казала.
 */
export function pickBestMatches<T extends { id: string; fit: JobFit }>(
  items: readonly T[],
): Map<string, FitReason[]> {
  const best = items
    .filter((i) => i.fit.best)
    .sort((a, b) => b.fit.score - a.fit.score)
    .slice(0, DISPATCH_CONFIG.BEST_MATCH_LIMIT)
  return new Map(best.map((i) => [i.id, i.fit.reasons]))
}
