// src/routes/api/cron/+server.ts
import { json, error } from '@sveltejs/kit'
import { prisma } from '$lib/prisma'
import { CRON_SECRET } from '$env/static/private'
import type { RequestHandler } from './$types'

/**
 * GET /api/cron?task=auto-expire|all
 *
 * Защищено через CRON_SECRET в Authorization: Bearer ...
 * Вызывается внешним cron-сервисом раз в час.
 */

interface CronResult {
  task: string
  ok: boolean
  affected: number
  error?: string
}

export const GET: RequestHandler = async ({ url, request }) => {
  const authHeader = request.headers.get('authorization')
  if (!CRON_SECRET) throw error(500, 'CRON_SECRET not configured')
  if (authHeader !== `Bearer ${CRON_SECRET}`) throw error(401, 'Unauthorized')

  const task = url.searchParams.get('task') ?? 'all'
  const results: CronResult[] = []

  if (task === 'auto-expire' || task === 'all') {
    results.push(await runAutoExpire())
  }

  return json({
    ok: results.every((r) => r.ok),
    runAt: new Date().toISOString(),
    results,
  })
}

/**
 * Находит OPEN jobs с истёкшим expiresAt и помечает как EXPIRED.
 */
async function runAutoExpire(): Promise<CronResult> {
  try {
    const now = new Date()
    const result = await prisma.job.updateMany({
      where: {
        status: 'OPEN',
        expiresAt: { lte: now },
      },
      data: {
        status: 'EXPIRED',
        closedAt: now,
      },
    })

    return { task: 'auto-expire', ok: true, affected: result.count }
  } catch (err) {
    return {
      task: 'auto-expire',
      ok: false,
      affected: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
