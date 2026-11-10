// Обсяг роботи заявки — шкала 1–10, спільна для всіх категорій (Job.effort).
//
// Сама формула — контент категорії (cleaning/effort.ts рахує години роботи
// однієї людини). Тут — те, що однакове для будь-якої категорії: години →
// бал, рівні для підбору й підписів і поправка асистента.
//
// Бал рахує сервер, а не модель. Асистент лише підказує поправку ±1 тим,
// чого немає в полях заявки («панорамні вітрини в ТЦ», «дуже брудно»).
// Причини дві: бал від моделі плаває від запуску до запуску, і клієнт міг
// би розмовою «зменшити» заявку, а від балу залежить, кого кличемо першим.

export const EFFORT_MIN = 1
export const EFFORT_MAX = 10

/**
 * Межі балів за годинами роботи ОДНІЄЇ людини, включно з дорогою й
 * підготовкою: до 1.5 год — 1, до 2 — 2, … понад 22 — 10.
 */
const HOURS_TO_EFFORT = [1.5, 2, 3, 4.5, 6, 8, 11, 15, 22] as const

export function effortFromHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return EFFORT_MIN
  const i = HOURS_TO_EFFORT.findIndex((max) => hours <= max)
  return i === -1 ? EFFORT_MAX : i + 1
}

export function clampEffort(n: number): number {
  return Math.min(EFFORT_MAX, Math.max(EFFORT_MIN, Math.round(n)))
}

/**
 * Поправка асистента з чернетки заявки. Лише −1, 0 або +1: вона проходить
 * через браузер клієнта (чернетка → POST /api/jobs), тож більший крок
 * дозволив би переписати бал руками.
 */
export function parseEffortAdjust(raw: unknown): -1 | 0 | 1 {
  return raw === 1 || raw === -1 ? raw : 0
}

/**
 * Рівні — для підбору (хто йде першим) і для підпису. Межі підібрані під
 * формат роботи: невелике — одна людина за пару годин, дуже велике —
 * день бригади.
 */
export type EffortTier = 'small' | 'medium' | 'large' | 'xlarge'

export function effortTier(effort: number): EffortTier {
  if (effort <= 3) return 'small'
  if (effort <= 6) return 'medium'
  if (effort <= 8) return 'large'
  return 'xlarge'
}

export const EFFORT_LABELS: Record<EffortTier, string> = {
  small: 'Невелике',
  medium: 'Середнє',
  large: 'Велике',
  xlarge: 'Дуже велике',
}

/** Бал із бази: лише ціле 1–10, інакше null («невідомо»). */
export function asEffort(raw: unknown): number | null {
  return typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= EFFORT_MIN &&
    raw <= EFFORT_MAX
    ? raw
    : null
}
