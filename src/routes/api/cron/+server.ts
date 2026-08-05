// src/routes/api/cron/+server.ts
import { timingSafeEqual } from 'node:crypto'
import { json, error } from '@sveltejs/kit'
import { prisma } from '$lib/server/prisma'
import { CRON_SECRET } from '$env/static/private'
import { dispatchJob } from '$lib/server/dispatch'
import { DISPATCH_CONFIG } from '$lib/server/dispatch/types'
import type { RequestHandler } from './$types'

/**
 * Крон тут — СТРАХОВКА, а не основний механізм.
 *
 * Хвилі диспетчера планує сам процес (dispatch/scheduler.ts) одразу при
 * створенні заявки. Крон потрібен лише для випадку, коли процес
 * перезапустили між хвилями й таймери в пам'яті зникли.
 *
 * РЕКОМЕНДОВАНИЙ РОЗКЛАД:
 *   dispatch-waves — раз на 30 хвилин
 *   auto-expire    — раз на добу
 *
 * Не ставте щохвилини. Neon на безкоштовному тарифі тарифікує ЧАС РОБОТИ
 * вичислювача: база засинає в простої, а запит раз на хвилину не дає їй
 * заснути взагалі — місячна квота вигорає приблизно за тиждень навіть
 * при нульовому трафіку.
 *
 * GET /api/cron?task=auto-expire|dispatch-waves|all
 * Захищено через CRON_SECRET в Authorization: Bearer ...
 */

/** Інтервал страхувального крона — вікно сканування має його покривати. */
const CRON_INTERVAL_MIN = 30

/**
 * Скільки хвилин після створення заявку ще має сенс сканувати.
 * Рахується з конфіга хвиль плюс інтервал крона: заявка, створена одразу
 * після тіку, має потрапити в наступний. Окреме число тут тихо
 * розсинхронізувалося б із розкладом хвиль.
 */
const SCAN_WINDOW_MIN =
  DISPATCH_CONFIG.WAVES[DISPATCH_CONFIG.WAVES.length - 1].afterMinutes +
  CRON_INTERVAL_MIN

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

/**
 * Страховка для хвиль 2-3.
 *
 * У штатному режимі сюди потрапляти нічому: хвилі вже відпрацювали за
 * таймерами планувальника. Ця задача підбирає заявки, чиї таймери зникли
 * разом із перезапуском процесу.
 *
 * Ідемпотентно: мозок не задублює уведомлення (DispatchEvent з unique
 * [jobId, masterId] + advisory-лок), тож зайвий виклик безпечний.
 */
async function runDispatchWaves(): Promise<CronResult> {
  try {
    // Заявки у вікні сканування, які ще активні й потребують хвилі.
    const since = new Date(Date.now() - SCAN_WINDOW_MIN * 60 * 1000)

    const jobs = await prisma.job.findMany({
      where: {
        status: 'OPEN',
        createdAt: { gte: since },
        // Той самий поріг, за яким мозок зупиняє розсилку (stopReason:
        // 'enough-proposals') — інакше крон дарма будив би диспетчер.
        proposalsCount: { lt: DISPATCH_CONFIG.ENOUGH_PROPOSALS },
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
