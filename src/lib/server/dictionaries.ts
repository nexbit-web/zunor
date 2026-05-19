// src/lib/server/dictionaries.ts
import { prisma } from '$lib/prisma'

let cache: {
  categories: Map<string, string>
  cities: Map<string, string>
  loadedAt: number
} | null = null

const TTL = 5 * 60_000 // 5 минут

export async function getDictionaries() {
  const now = Date.now()
  if (cache && now - cache.loadedAt < TTL) return cache

  const [categories, cities] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      select: { slug: true, name: true },
    }),
    prisma.city.findMany({
      where: { isActive: true },
      select: { slug: true, name: true },
    }),
  ])

  cache = {
    categories: new Map(categories.map((c) => [c.slug, c.name])),
    cities: new Map(cities.map((c) => [c.slug, c.name])),
    loadedAt: now,
  }
  return cache
}

export async function categoryName(slug: string): Promise<string> {
  const { categories } = await getDictionaries()
  return categories.get(slug) ?? slug
}

export async function cityName(slug: string): Promise<string> {
  const { cities } = await getDictionaries()
  return cities.get(slug) ?? slug
}
