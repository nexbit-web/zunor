// src/lib/server/dispatch/index.ts
//
// Публічний API мозку-диспетчера.
// Назовні видно тільки dispatchJob() та хелпери для аналітики.
//
// Потік: advisory-лок по заявці → decide() вирішує кого → claim (logDispatch)
// → коміт лока → шлемо уведомлення вже застовбленим.

import { prisma } from '../prisma'
import { decide } from './engine'
import { logDispatch, markOpened, markResponded } from './log'
import { Notify } from '../notifications'
import type { ScoredCandidate } from './types'

// Namespace для advisory-локів саме розсилки (щоб не перетинатись з іншими локами).
const DISPATCH_LOCK_NS = 4242

/**
 * Запускає (або продовжує) розсилку для заявки.
 *
 * Викликається:
 *   - одразу при створенні заявки (хвиля 1)
 *   - cron'ом раз на хвилину для заявок без відгуків (хвилі 2-3)
 *
 * Безпечно під конкуренцією: розсилка однієї заявки серіалізована
 * advisory-локом, тож паралельні виклики (create + cron, або два тики крона)
 * не виберуть і не уведомлять тих самих майстрів двічі.
 */
export async function dispatchJob(
  jobId: string,
  jobTitle: string,
): Promise<{ notified: number; wave: number; stopped?: string }> {
  // Рішення + claim — в одній транзакції під локом заявки. Лок тримаємо лише
  // на час швидких запитів до БД; мережеві пуші робимо вже після коміту.
  const { decision, claimed } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DISPATCH_LOCK_NS}, hashtext(${jobId}))`

    const decision = await decide(jobId, tx)
    if (!decision.shouldDispatch) {
      return { decision, claimed: [] as ScoredCandidate[] }
    }

    // Столбимо ПЕРШ ніж слати: якщо процес упаде далі, ці майстри вже у пам'яті
    // і наступна хвиля їх не вибере — дубля не буде (у гіршому разі — пропуск).
    await logDispatch(jobId, decision.wave, decision.toNotify, tx)
    return { decision, claimed: decision.toNotify }
  })

  if (claimed.length === 0) {
    return { notified: 0, wave: decision.wave, stopped: decision.stopReason }
  }

  // Пуші — поза локом і поза транзакцією (мережа не має тримати конекшн/лок).
  // fail-soft на кожного: збій одного не зриває решту.
  await Promise.all(
    claimed.map(async (c) => {
      try {
        await Notify.newJob(c.id, jobId, jobTitle)
      } catch (err) {
        console.error(`[dispatch] notify ${c.id} failed:`, err)
      }
    }),
  )

  console.log(
    `[dispatch] job=${jobId} wave=${decision.wave} notified=${claimed.length}`,
  )

  return { notified: claimed.length, wave: decision.wave }
}

// Реекспорт хелперів аналітики — щоб викликати з API endpoints
export { markOpened, markResponded }
