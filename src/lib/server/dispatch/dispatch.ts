// Одна хвиля розсилки: лок на заявку → рішення → запис → коміт → події.

import { pushNotification } from '../notifications'
import { decide } from './decide'
import { finishDispatch, recordWave } from './data/journal'
import { prisma } from './data/db'
import type { DispatchResult } from './types'

/** Простір advisory-локів розсилки, щоб не перетинатися з іншими локами. */
const LOCK_NAMESPACE = 4242

/** Neon після сну віддає зʼєднання не одразу — дефолтних 2 с замало. */
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const

/**
 * Запускає хвилю, що настала для заявки. Ідемпотентно: повторний виклик
 * нікого не покличе двічі, тож кликати можна будь-коли й будь-звідки.
 *
 * Рішення й запис — в одній транзакції під локом заявки: таймер,
 * відновлення й перевідкриття заявки не перетнуться. Події Pusher — після
 * коміту: сповіщення про те, чого в базі немає, не спалахне ніколи.
 */
export async function dispatchJob(
  jobId: string,
  now: Date = new Date(),
): Promise<DispatchResult> {
  const { decision, notices } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}, hashtext(${jobId}))`
    const decision = await decide(jobId, tx, now)

    if (decision.kind === 'stop') {
      if (decision.reason === 'enough-proposals') {
        await finishDispatch(tx, jobId)
      }
      return { decision, notices: [] }
    }
    return { decision, notices: await recordWave(tx, jobId, decision) }
  }, TX_OPTIONS)

  if (decision.kind === 'stop') return decision

  // Сповіщення вже в базі: збій події лише відкладає дзвіночок до
  // наступного відкриття сторінки, а не губить його.
  await Promise.allSettled(notices.map(pushNotification))

  const { wave, radiusKm, lastCall } = decision
  if (notices.length > 0) {
    console.log(
      `[dispatch] job=${jobId} wave=${wave} radius=${radiusKm ?? 'all'}` +
        `${lastCall ? ' last-call' : ''} notified=${notices.length}`,
    )
  }
  return { kind: 'wave', wave, notified: notices.length, lastCall }
}
