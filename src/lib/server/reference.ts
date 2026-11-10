// Довідники — міста, райони й категорії: найстабільніші дані в системі, а читає їх
// лоадер /dashboard/jobs на кожен вхід. Кеш у пам'яті процесу законний через
// adapter-node (інстанс один і живе довго), і виграш не в мілісекундах, а в
// тому, що навігація перестає будити базу — Neon тарифікує час її роботи.
//
// Два рівні: памʼять процесу (миттєво, без мережі) і Redis — він переживає
// рестарт і деплой, тож після них довідники теж не йдуть у базу.
//
// TTL, а не вічне життя: додане руками в БД місто з'явиться саме, без деплою.

import { prisma } from './prisma'
import { cached, forget, type JsonSafe } from './cache'
import type { District } from '$lib/geo/districts'

const MEMORY_TTL_MS = 10 * 60_000
/** Найдовше, скільки зміна руками в БД чекає, поки її побачать. */
const REDIS_TTL_SEC = 60 * 60

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

/** Район у формі, яку читають чисті функції $lib/geo/districts. */
export type RefDistrict = District

interface Memo<T> {
  value: T | null
  expiresAt: number
  /** Запит, що вже летить: десять одночасних промахів — один SELECT. */
  inFlight: Promise<T> | null
}

const KEYS = ['ref:cities', 'ref:categories', 'ref:districts'] as const
type RefKey = (typeof KEYS)[number]

const memos = new Map<RefKey, Memo<unknown>>()

/** Памʼять → Redis → база, з одним запитом на всіх, хто чекає. */
function reference<T>(
  key: RefKey,
  load: () => Promise<T & JsonSafe<T>>,
): Promise<T> {
  const memo = (memos.get(key) ?? {
    value: null,
    expiresAt: 0,
    inFlight: null,
  }) as Memo<T>
  memos.set(key, memo)

  if (memo.value !== null && memo.expiresAt > Date.now()) {
    return Promise.resolve(memo.value)
  }
  memo.inFlight ??= cached(key, REDIS_TTL_SEC, load)
    .then((value) => {
      memo.value = value
      memo.expiresAt = Date.now() + MEMORY_TTL_MS
      return value
    })
    .finally(() => {
      memo.inFlight = null
    })
  return memo.inFlight
}

export function getCities(): Promise<RefCity[]> {
  return reference('ref:cities', () =>
    prisma.city.findMany({
      where: { isActive: true },
      orderBy: [{ isCapital: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        region: true,
        isCapital: true,
      },
    }),
  )
}

export function getCategories(): Promise<RefCategory[]> {
  return reference('ref:categories', () =>
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        icon: true,
      },
    }),
  )
}

/**
 * Активні райони всіх міст разом. Їх кілька десятків на місто, тож
 * тримати один список і фільтрувати за містом (cityDistricts) дешевше,
 * ніж кеш на кожне місто окремо. Розсилка читає їх на кожну хвилю —
 * без кешу кожна хвиля була б зайвим запитом до Neon.
 */
export function getDistricts(): Promise<RefDistrict[]> {
  return reference('ref:districts', async () => {
    const rows = await prisma.district.findMany({
      where: { isActive: true, city: { isActive: true } },
      orderBy: [{ citySlug: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        citySlug: true,
        slug: true,
        name: true,
        group: true,
        latitude: true,
        longitude: true,
      },
    })
    return rows.map((r) => ({
      citySlug: r.citySlug,
      slug: r.slug,
      name: r.name,
      group: r.group,
      lat: r.latitude,
      lng: r.longitude,
    }))
  })
}

/** Скинути кеш і в памʼяті, і в Redis — після зміни довідників. */
export function invalidateReference(): Promise<void> {
  memos.clear()
  return forget(...KEYS)
}
