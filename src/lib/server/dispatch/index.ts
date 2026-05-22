// src/lib/server/dispatch/index.ts
//
// Публічний API мозку-диспетчера.
// Назовні видно тільки dispatchJob() та хелпери для аналітики.
//
// Потік: decide() вирішує кого → шлемо уведомлення → logDispatch() пише пам'ять.

import { decide } from './engine'
import { logDispatch, markOpened, markResponded } from './log'
import { Notify } from '../notifications'

/**
 * Запускає (або продовжує) розсилку для заявки.
 *
 * Викликається:
 *   - одразу при створенні заявки (хвиля 1)
 *   - cron'ом раз на хвилину для заявок без відгуків (хвилі 2-3)
 *
 * Ідемпотентна: повторний виклик не задублює уведомлення
 * (мозок виключає вже уведомлених).
 */
export async function dispatchJob(
  jobId: string,
  jobTitle: string,
): Promise<{ notified: number; wave: number; stopped?: string }> {
  const decision = await decide(jobId)

  if (!decision.shouldDispatch) {
    return {
      notified: 0,
      wave: decision.wave,
      stopped: decision.stopReason,
    }
  }

  // Шлемо уведомлення (fail-soft на кожного)
  await Promise.all(
    decision.toNotify.map(async (c) => {
      try {
        await Notify.newJob(c.id, jobId, jobTitle)
      } catch (err) {
        console.error(`[dispatch] notify ${c.id} failed:`, err)
      }
    }),
  )

  // Пишемо пам'ять (один запит на всю хвилю)
  await logDispatch(jobId, decision.wave, decision.toNotify)

  console.log(
    `[dispatch] job=${jobId} wave=${decision.wave} notified=${decision.toNotify.length}`,
  )

  return { notified: decision.toNotify.length, wave: decision.wave }
}

// Реекспорт хелперів аналітики — щоб викликати з API endpoints
export { markOpened, markResponded }
