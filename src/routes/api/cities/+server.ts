import { json } from '@sveltejs/kit'
import { getCities } from '$lib/server/reference'
import type { RequestHandler } from './$types'

/** GET /api/cities — активні міста, з кешу довідників. */
export const GET: RequestHandler = async ({ setHeaders }) => {
  const cities = await getCities()

  setHeaders({
    'cache-control':
      'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600',
  })

  return json({ cities })
}
