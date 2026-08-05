// src/routes/api/cities/+server.ts
import { json } from '@sveltejs/kit'
import { getCities } from '$lib/server/reference'
import type { RequestHandler } from './$types'

/**
 * GET /api/cities — список активных городов.
 *
 * Читает из кеша в памяти процесса (см. $lib/server/reference), а не из БД:
 * список меняется раз в месяцы, а запрос сюда идёт с каждой формы.
 */
export const GET: RequestHandler = async ({ setHeaders }) => {
  const cities = await getCities()

  setHeaders({
    'cache-control':
      'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600',
  })

  return json({ cities })
}
