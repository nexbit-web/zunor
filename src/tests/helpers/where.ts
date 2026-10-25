// Пошук умов у Prisma where на будь-якій глибині вкладеності.
//
// Правило видимості стрічки живе в мозку підбору й перевіряється там
// поведінково (dispatch-feed.test.ts). Тестам роутів треба знати лише, що
// його умови доїхали до запиту, — не те, як саме вони вкладені в AND/OR.

type Condition = Record<string, unknown>

/** Усі обʼєкти-умови всередині `where`, для яких `hit` повертає true. */
export function conditions(
  where: unknown,
  hit: (condition: Condition) => boolean,
): Condition[] {
  if (Array.isArray(where)) return where.flatMap((w) => conditions(w, hit))
  if (!where || typeof where !== 'object' || where instanceof Date) return []

  const condition = where as Condition
  return [
    ...(hit(condition) ? [condition] : []),
    ...Object.values(condition).flatMap((v) => conditions(v, hit)),
  ]
}

/** Райони з умови `district: { in: [...] }`; null — такої умови немає. */
export function districtsIn(where: unknown): string[] | null {
  const [found] = conditions(
    where,
    (c) =>
      typeof c.district === 'object' &&
      c.district !== null &&
      'in' in c.district,
  )
  return found ? (found.district as { in: string[] }).in : null
}
