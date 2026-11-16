// * райони міст — чисті функції над списком районів; звідки список, вони не
// * знають. Місто без районів працює без кілець

import { distanceKm, type GeoPoint } from './distance'

export interface District extends GeoPoint {
  citySlug: string
  slug: string
  name: string
  /** Для групування в списку: спершу місто, нижче — передмістя. */
  group: 'CITY' | 'SUBURB'
}

/** Райони одного міста зі спільного списку, у порядку довідника. */
export function cityDistricts<T extends District>(
  all: readonly T[],
  city: string | null | undefined,
): T[] {
  if (!city) return []
  return all.filter((d) => d.citySlug === city)
}

export function findDistrict<T extends District>(
  list: readonly T[],
  slug: string | null | undefined,
): T | null {
  if (!slug) return null
  return list.find((d) => d.slug === slug) ?? null
}

/** Відстань між районами одного міста; null — хоч один невідомий: «невідомо» ≠ «далеко». */
export function districtDistanceKm(
  list: readonly District[],
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  const a = findDistrict(list, from)
  const b = findDistrict(list, to)
  if (!a || !b) return null
  return distanceKm(a, b)
}

/**
 * Райони, до яких від `from` не далі `radiusKm` (сам `from` теж), — від
 * ближчого до дальшого. null-радіус — усі райони списку.
 */
export function districtsWithin<T extends District>(
  list: readonly T[],
  from: string | null | undefined,
  radiusKm: number | null,
): T[] {
  const origin = findDistrict(list, from)
  if (!origin) return []
  return list
    .map((d) => ({ d, km: distanceKm(origin, d) }))
    .filter(({ km }) => radiusKm === null || km <= radiusKm)
    .sort((x, y) => x.km - y.km)
    .map(({ d }) => d)
}

/**
 * Підпис відстані для людини: «≈4 км», а свій район — словами. Точніше
 * за кілометр не пишемо: точка району — це центр, а не адреса.
 */
export function formatDistance(km: number): string {
  if (km < 0.5) return 'ваш район'
  return `≈${Math.max(1, Math.round(km))} км`
}

/**
 * Район заявки й відстань від району майстра. `list` — райони міста заявки;
 * майстрові з іншого міста передавай null.
 */
export function jobPlace(
  list: readonly District[],
  jobDistrict: string | null,
  masterDistrict: string | null,
): { district: string | null; distanceKm: number | null } {
  const km = districtDistanceKm(list, masterDistrict, jobDistrict)
  return {
    district: findDistrict(list, jobDistrict)?.name ?? null,
    distanceKm: km === null ? null : Math.round(km * 10) / 10,
  }
}
