// Обсяг прибирання: скільки годин роботи однієї людини в заявці — і бал
// 1–10 за ним ($lib/categories/effort). Від балу залежить, кого розсилка
// кличе першим: на невелике — майстрів, що працюють самі, на дуже велике —
// бригади й компанії (dispatch/core/score.ts, crewFit).
//
// Числа — оцінка «на око» досвідченого клінера, а не норматив: важливо,
// щоб більша робота давала більший бал і щоб кухня не опинилась поруч із
// будинком. Тести перевіряють саме порядок, а не години.

import { clampEffort, effortFromHours, parseEffortAdjust } from '../effort'
import { SERVICES } from './presets'
import type { CleaningMetadata } from './title-gen'

/** Дорога, підготовка, інвентар — є в будь-якій заявці. */
const SETUP_HOURS = 0.75

/** Площа, коли клієнт її не назвав: за кімнатами. */
const AREA_BY_ROOMS: Record<string, number> = {
  '1': 40,
  '2': 60,
  '3': 80,
  '4plus': 120,
}
/** Будинок на ті самі кімнати — більший: сходи, коридори, санвузли. */
const HOUSE_AREA_FACTOR = 1.5
/**
 * Офіс і комерція без площі. Кімнати тут ненадійні: асистент для
 * комерції ставить їх мінімальними (prompt.ts), а реальний обʼєкт пише в
 * опис.
 */
const BUSINESS_AREA: Record<string, number> = { office: 80, commercial: 120 }
const FALLBACK_AREA = 40

/** м² за годину для однієї людини. */
const AREA_RATE: Record<string, number> = {
  standard: 25,
  regular: 25,
  deep: 12,
  'post-renovation': 8,
}

/** Годин на одне вікно за стороною миття. */
const WINDOW_HOURS: Record<string, number> = {
  inside: 0.3,
  outside: 0.4,
  both: 0.6,
}
/** Офіс і комерція: вітрини й панорамне скління, а не стандартна рама. */
const SHOWCASE_FACTOR = 1.5
/** Ззовні з третього поверху — робота на висоті, повільніше. */
const HIGH_FLOOR = 3
const HIGH_FLOOR_FACTOR = 1.3

/** Хімчистка: годин на предмет (за варіантом, якщо він є). */
const ITEM_HOURS: Record<string, Record<string, number> & { _: number }> = {
  sofa: { _: 1.5, '2': 1.25, '3': 1.5, corner: 2 },
  armchair: { _: 0.5 },
  mattress: { _: 1, single: 0.75, double: 1 },
  carpet: { _: 1, small: 0.5, medium: 1, large: 1.5 },
  chairs: { _: 0.2 },
}

const TRASH_REMOVAL_HOURS = 2
/** Без ліфта з цього поверху — інвентар і сміття носять сходами. */
const NO_ELEVATOR_FLOOR = 4
const NO_ELEVATOR_HOURS = 0.5
const BALCONY_HOURS: Record<string, number> = { standard: 0.5, panoramic: 1 }

function areaOf(m: Partial<CleaningMetadata>): number {
  if (typeof m.areaM2 === 'number' && m.areaM2 > 0) return m.areaM2
  const business = BUSINESS_AREA[m.premise ?? '']
  if (business) return business
  const byRooms = AREA_BY_ROOMS[m.rooms ?? ''] ?? FALLBACK_AREA
  return m.premise === 'house' ? byRooms * HOUSE_AREA_FACTOR : byRooms
}

function windowHours(m: Partial<CleaningMetadata>): number {
  const count = m.windowsCount ?? 1
  let per = WINDOW_HOURS[m.windowSide ?? ''] ?? WINDOW_HOURS.both
  if (m.premise === 'office' || m.premise === 'commercial') {
    per *= SHOWCASE_FACTOR
  }
  if (m.windowSide !== 'inside' && (m.floor ?? 0) >= HIGH_FLOOR) {
    per *= HIGH_FLOOR_FACTOR
  }
  return count * per
}

function itemHours(m: Partial<CleaningMetadata>): number {
  return (m.items ?? []).reduce((sum, it) => {
    const def = ITEM_HOURS[it.type]
    if (!def) return sum
    return sum + (def[it.variant ?? '_'] ?? def._) * it.qty
  }, 0)
}

/** Години роботи однієї людини, включно з дорогою й підготовкою. */
export function cleaningHours(raw: unknown): number {
  const m = (
    raw && typeof raw === 'object' ? raw : {}
  ) as Partial<CleaningMetadata>

  let hours = SETUP_HOURS
  if (m.service === 'windows') hours += windowHours(m)
  else if (m.service === 'sofa') hours += itemHours(m)
  else hours += areaOf(m) / (AREA_RATE[m.service ?? ''] ?? AREA_RATE.standard)

  if (m.trash === 'needs-removal') hours += TRASH_REMOVAL_HOURS
  if (m.hasElevator === 'no' && (m.floor ?? 0) >= NO_ELEVATOR_FLOOR) {
    hours += NO_ELEVATOR_HOURS
  }
  hours += BALCONY_HOURS[m.balcony ?? ''] ?? 0
  return hours
}

/**
 * Бал 1–10: години → бал, плюс поправка асистента (effortAdjust). null —
 * metadata без відомої послуги: «невідомо», а не «невелике», — інакше
 * бита заявка штрафувала б компанії ні за що.
 */
export function cleaningEffort(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (!SERVICES.some((s) => s.key === m.service)) return null
  let adjust = parseEffortAdjust(m.effortAdjust)
  // «Лише кухня» модель зменшує на −1 навіть тоді, коли площу (10 м²) вже
  // названо, — малий розмір рахувався б двічі. Прогін діалогів показав,
  // що заборона в промпті цього не прибирає, тож правило тут: з площею
  // −1 не діє. +1 лишається — він про те, чого в площі немає (вітрини,
  // сильне забруднення).
  if (adjust < 0 && typeof m.areaM2 === 'number') adjust = 0
  return clampEffort(effortFromHours(cleaningHours(m)) + adjust)
}
