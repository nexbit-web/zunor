// src/lib/server/reference.ts
//
// Довідники — міста й категорії. Це найстабільніші дані в системі: рядків
// одиниці, змінюються вручну раз на місяці. При цьому їх читає лоадер
// /dashboard/jobs (на КОЖЕН вхід на головну сторінку дашборда) і два
// публічні ендпоінти.
//
// Тримаємо в пам'яті процесу — це законно саме тут через adapter-node
// (див. AGENTS.md, розділ 2.1): інстанс один і живе довго. Виграш не
// стільки в мілісекундах запиту, скільки в тому, що навігація перестає
// будити базу: на тарифі Neon рахується ЧАС РОБОТИ вичислювача.
//
// Кеш «дірявий» навмисно: TTL, а не вічне життя. Якщо місто додали руками
// в БД, воно з'явиться саме, без деплою.

import { prisma } from './prisma'

const TTL_MS = 10 * 60_000

export interface RefCity {
  id: string
  slug: string
  name: string
  region: string | null
  isCapital: boolean
}

export interface RefCategory {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
}

interface Cached<T> {
  value: T
  expiresAt: number
}

// Зберігаємо не тільки результат, а й проміс запиту: без цього десять
// одночасних запитів на холодному кеші зробили б десять однакових SELECT.
let citiesCache: Cached<RefCity[]> | null = null
let citiesInFlight: Promise<RefCity[]> | null = null

let categoriesCache: Cached<RefCategory[]> | null = null
let categoriesInFlight: Promise<RefCategory[]> | null = null

export async function getCities(): Promise<RefCity[]> {
  const now = Date.now()
  if (citiesCache && citiesCache.expiresAt > now) return citiesCache.value
  if (citiesInFlight) return citiesInFlight

  citiesInFlight = prisma.city
    .findMany({
      where: { isActive: true },
      orderBy: [{ isCapital: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        region: true,
        isCapital: true,
      },
    })
    .then((rows) => {
      citiesCache = { value: rows, expiresAt: Date.now() + TTL_MS }
      return rows
    })
    .finally(() => {
      citiesInFlight = null
    })

  return citiesInFlight
}

export async function getCategories(): Promise<RefCategory[]> {
  const now = Date.now()
  if (categoriesCache && categoriesCache.expiresAt > now) {
    return categoriesCache.value
  }
  if (categoriesInFlight) return categoriesInFlight

  categoriesInFlight = prisma.category
    .findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        icon: true,
      },
    })
    .then((rows) => {
      categoriesCache = { value: rows, expiresAt: Date.now() + TTL_MS }
      return rows
    })
    .finally(() => {
      categoriesInFlight = null
    })

  return categoriesInFlight
}

/** Скинути кеш. Потрібно, якщо довідники почнуть редагуватись із застосунку. */
export function invalidateReference(): void {
  citiesCache = null
  categoriesCache = null
}
