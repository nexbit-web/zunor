import { timingSafeEqual } from 'node:crypto'
import { json, error } from '@sveltejs/kit'
import { prisma } from '$lib/server/prisma'
import { CRON_SECRET } from '$env/static/private'
import { resumeDispatch } from '$lib/server/dispatch'
import type { RequestHandler } from './$types'

/**
 * GET /api/cron?task=auto-expire|dispatch-waves|all
 * Авторизація: CRON_SECRET в Authorization: Bearer ...
 *
 * dispatch-waves — СТРАХОВКА, а не основний механізм: хвилі ведуть таймери
 * мозку підбору, а загублене ними підхоплює відновлення на старті процесу.
 * Крон кличе те саме відновлення — на випадок, якщо процес жив, а хвиля
 * вичерпала повтори.
 *
 * Розклад: dispatch-waves — раз на 30 хвилин, auto-expire — раз на добу.
 * Частіше ставити не можна, причина — у scheduler.ts.
 */

interface CronResult {
  task: string
  ok: boolean
  affected: number
  error?: string
}

/**
 * Порівняння секрету за постійний час.
 *
 * Звичайний `!==` виходить на першому відмінному байті, тож час відповіді
 * підказує, скільки символів уже вгадано. Через мережу шум великий і атака
 * малореальна, але ціна захисту тут — три рядки.
 */
function secretMatches(header: string | null, secret: string): boolean {
  if (!header) return false
  const expected = `Bearer ${secret}`
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  // timingSafeEqual вимагає однакової довжини, а сама довжина не таємниця.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const GET: RequestHandler = async ({ url, request }) => {
  const authHeader = request.headers.get('authorization')
  if (!CRON_SECRET) throw error(500, 'CRON_SECRET not configured')
  if (!secretMatches(authHeader, CRON_SECRET)) throw error(401, 'Unauthorized')

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

/** Хвилі, які не встигли таймери: те саме відновлення, що й на старті. */
async function runDispatchWaves(): Promise<CronResult> {
  try {
    const { caughtUp } = await resumeDispatch()
    return { task: 'dispatch-waves', ok: true, affected: caughtUp }
  } catch (err) {
    return {
      task: 'dispatch-waves',
      ok: false,
      affected: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
