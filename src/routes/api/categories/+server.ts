import { json } from '@sveltejs/kit'
import { getCategories } from '$lib/server/reference'
import type { RequestHandler } from './$types'

/** GET /api/categories — активні категорії, з кешу довідників. */
export const GET: RequestHandler = async ({ setHeaders }) => {
  const categories = await getCategories()

  setHeaders({
    'cache-control':
      'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
  })

  return json({ categories })
}
