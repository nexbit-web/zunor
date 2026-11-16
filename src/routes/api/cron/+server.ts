import { timingSafeEqual } from 'node:crypto'
import { json, error } from '@sveltejs/kit'
import { prisma } from '$lib/server/prisma'
import { CRON_SECRET } from '$env/static/private'
import { resumeDispatch } from '$lib/server/dispatch'
import { sendDayBeforeReminders } from '$lib/server/reminders'
import type { RequestHandler } from './$types'

/**
 * GET /api/cron?task=auto-expire|dispatch-waves|reminders|all
 * Авторизація — CRON_SECRET в Authorization: Bearer.
 *
 * dispatch-waves і reminders — страховка: основну роботу роблять таймери
 * процесу. Розклад рідкісний навмисно — причина в scheduler.ts.
 */

interface CronResult {
  task: string
  ok: boolean
  affected: number
  error?: string
}

/** Порівняння секрету за постійний час: `!==` видає, скільки символів уже вгадано. */
function secretMatches(header: string | null, secret: string): boolean {
  if (!header) return false
  const expected = `Bearer ${secret}`
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  // * timingSafeEqual вимагає однакової довжини, а сама довжина не таємниця
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

  if (task === 'reminders' || task === 'all') {
    results.push(await runReminders())
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

/** Нагадування за день до прибирання — те саме, що шле таймер процесу. */
async function runReminders(): Promise<CronResult> {
  try {
    return { task: 'reminders', ok: true, affected: await sendDayBeforeReminders() }
  } catch (err) {
    console.error('[cron] reminders failed:', err)
    return { task: 'reminders', ok: false, affected: 0, error: 'reminders failed' }
  }
}
