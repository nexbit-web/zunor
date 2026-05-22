// src/routes/api/cron/+server.ts
import { json, error } from '@sveltejs/kit'
import { prisma } from '$lib/prisma'
import { CRON_SECRET } from '$env/static/private'
import { dispatchJob } from '$lib/server/dispatch'
import type { RequestHandler } from './$types'

/**
 * GET /api/cron?task=auto-expire|dispatch-waves|all
 *
 * Захищено через CRON_SECRET в Authorization: Bearer ...
 * Викликається зовнішнім cron-сервісом (раз на хвилину для dispatch-waves).
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

  if (task === 'dispatch-waves' || task === 'all') {
    results.push(await runDispatchWaves())
  }

  return json({
    ok: results.every((r) => r.ok),
    runAt: new Date().toISOString(),
    results,
  })
}

/**
 * Знаходить OPEN jobs з простроченим expiresAt і помічає як EXPIRED.
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

/**
 * Хвилі 2-3 диспетчера.
 * Знаходить OPEN заявки, які ще не набрали достатньо відгуків,
 * і викликає мозок ще раз — він сам вирішить, кого уведомити далі
 * (за віком заявки визначає хвилю, виключає вже уведомлених).
 *
 * Ідемпотентно: мозок не задублює уведомлення.
 */
async function runDispatchWaves(): Promise<CronResult> {
  try {
    // Заявки, створені за останні 30 хв, які ще активні й потребують хвилі.
    const since = new Date(Date.now() - 30 * 60 * 1000)

    const jobs = await prisma.job.findMany({
      where: {
        status: 'OPEN',
        createdAt: { gte: since },
        proposalsCount: { lt: 5 },  
      },
      select: { id: true, title: true },
      take: 100,
    })

    let dispatched = 0
    for (const job of jobs) {
      const res = await dispatchJob(job.id, job.title).catch((err) => {
        console.error(`[cron:dispatch] job ${job.id} failed:`, err)
        return null
      })
      if (res && res.notified > 0) dispatched++
    }

    return { task: 'dispatch-waves', ok: true, affected: dispatched }
  } catch (err) {
    return {
      task: 'dispatch-waves',
      ok: false,
      affected: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
