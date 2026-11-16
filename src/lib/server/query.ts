// * числа з query пише клієнт: Number('abc') — NaN, а NaN проходить крізь
// * Math.min/max аж до Prisma

/** Ціле в межах; порожнє, сміття й NaN → fallback, дробове зрізається. */
export function intParam(
  raw: string | null,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  if (raw === null || raw.trim() === '') return fallback

  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback

  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/** Гривні → невідʼємні копійки; порожнє чи сміття → null («фільтра немає»). */
export function moneyParam(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null

  const value = Number(raw)
  if (!Number.isFinite(value)) return null

  return Math.max(0, Math.round(value * 100))
}
