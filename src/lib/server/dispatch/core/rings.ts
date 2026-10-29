// Кільця розсилки: кого кличе хвиля залежно від відстані до заявки.

import { DISPATCH_CONFIG } from '../config'
import { travelDistance } from './score'
import type { Candidate } from '../types'

/**
 * null-радіус — усе місто. Невідома відстань потрапляє лише туди.
 * Відстань — у часі дороги: майстер з авто входить у кільце раніше за
 * сусіда без нього (travelKm).
 */
export function withinRadius(
  c: Pick<Candidate, 'distanceKm' | 'travelKm'>,
  radiusKm: number | null,
): boolean {
  if (radiusKm === null) return true
  const km = travelDistance(c)
  return km !== null && km <= radiusKm
}

/**
 * Межа самого майстра («до 5 км»). Кільця її не переступають; лише
 * остання хвиля, коли заявку побачило замало майстрів (plan.ts, lastCall).
 * Відстань невідома або межі немає — у межах: заявка не має пропасти.
 */
export function acceptsDistance(
  distanceKm: number | null,
  travelRadiusKm: number | null,
): boolean {
  if (distanceKm === null || travelRadiusKm === null) return true
  return distanceKm <= travelRadiusKm
}

/**
 * Радіус хвилі. Починаємо з кільця самої хвилі; кільце, де менше
 * MIN_RING_CANDIDATES нових майстрів, пропускаємо одразу, не чекаючи
 * таймера. Заявка без району — кілець немає зовсім.
 */
export function ringRadius(
  wave: number,
  candidates: readonly Pick<Candidate, 'distanceKm' | 'travelKm'>[],
  jobLocated: boolean,
): number | null {
  if (!jobLocated) return null

  const { WAVES, MIN_RING_CANDIDATES } = DISPATCH_CONFIG
  for (let i = Math.max(0, wave - 1); i < WAVES.length; i++) {
    const radius = WAVES[i].radiusKm
    if (radius === null) return null
    const inside = candidates.filter((c) => withinRadius(c, radius)).length
    if (inside >= MIN_RING_CANDIDATES) return radius
  }
  return null
}
