// Розбір числових параметрів з query-рядка.
//
// Навіщо окремий модуль замість Number() на місці: `Number('abc')` — це NaN,
// а NaN мовчки проходить крізь Math.min/Math.max («Math.min(50, NaN)» дорівнює
// NaN) і доїжджає до Prisma, де перетворюється на 500 з голим стектрейсом.
// Тобто ?limit=abc клав ендпоінт, і це навіть не потребувало сесії з правами.
//
// Правило одне: параметр із URL пише КЛІЄНТ, тож будь-яке сміття має
// перетворюватись на дефолт, а не на виняток.

/**
 * Ціле число в заданих межах. Порожньо, сміття, NaN, Infinity → `fallback`.
 * Дробові зрізаються, вихід за межі затискається.
 */
export function intParam(
  raw: string | null,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  if (raw === null || raw.trim() === '') return fallback

  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback

  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/**
 * Гривні з параметра → невідʼємні копійки. Порожньо чи сміття → `null`,
 * тобто «фільтра немає», а не «фільтр на NaN».
 */
export function moneyParam(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null

  const value = Number(raw)
  if (!Number.isFinite(value)) return null

  return Math.max(0, Math.round(value * 100))
}
