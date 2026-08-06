// Довідники — міста й категорії: найстабільніші дані в системі, а читає їх
// лоадер /dashboard/jobs на кожен вхід. Кеш у пам'яті процесу законний через
// adapter-node (інстанс один і живе довго), і виграш не в мілісекундах, а в
// тому, що навігація перестає будити базу — Neon тарифікує час її роботи.
//
// TTL, а не вічне життя: додане руками в БД місто з'явиться саме, без деплою.

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
