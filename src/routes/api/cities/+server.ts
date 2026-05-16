// src/routes/api/cities/+server.ts
import { json } from '@sveltejs/kit'
import { prisma } from '$lib/prisma'
import type { RequestHandler } from './$types'

/**
 * GET /api/cities — список активных городов.
 */
export const GET: RequestHandler = async ({ setHeaders }) => {
  const cities = await prisma.city.findMany({
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

  setHeaders({
    'cache-control':
      'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600',
  })

  return json({ cities })
}
