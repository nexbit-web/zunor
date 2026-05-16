// src/routes/api/categories/+server.ts
import { json } from '@sveltejs/kit'
import { prisma } from '$lib/prisma'
import type { RequestHandler } from './$types'

/**
 * GET /api/categories — список активных категорий.
 *
 * Используется в:
 *   - форме создания Job (выбор категории)
 *   - settings (мастер выбирает свои категории)
 *   - главной странице
 */
export const GET: RequestHandler = async ({ setHeaders }) => {
  const categories = await prisma.category.findMany({
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

  setHeaders({
    'cache-control':
      'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
  })

  return json({ categories })
}
