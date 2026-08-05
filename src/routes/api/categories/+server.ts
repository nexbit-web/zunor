// src/routes/api/categories/+server.ts
import { json } from '@sveltejs/kit'
import { getCategories } from '$lib/server/reference'
import type { RequestHandler } from './$types'

/**
 * GET /api/categories — список активных категорий.
 *
 * Используется в:
 *   - форме создания Job (выбор категории)
 *   - settings (мастер выбирает свои категории)
 *   - главной странице
 *
 * Читает из кеша в памяти процесса (см. $lib/server/reference).
 */
export const GET: RequestHandler = async ({ setHeaders }) => {
  const categories = await getCategories()

  setHeaders({
    'cache-control':
      'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
  })

  return json({ categories })
}
