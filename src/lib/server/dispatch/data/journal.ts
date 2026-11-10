// Журнал розсилки (DispatchEvent): кого покликали, хто відкрив, хто
// відгукнувся. З нього ж рахуються відзивчивість і недавнє навантаження.

import { jobOfferNotice, newJobNotice } from '../../notifications'
import { responseRate } from '../core/score'
import { FINAL_WAVE } from '../core/waves'
import { prisma, type Db } from './db'
import type { Notification } from '../../../../generated/prisma/client'
import type { WavePlan } from '../types'

/** Що з журналу важить для балу майстра. */
export interface MasterHistory {
  readonly responseRate: number
  /** Скільки заявок йому слали за вікно недавнього навантаження. */
  readonly recent: number
}

/**
 * Записує відпрацьовану хвилю: покликаних, їхні сповіщення й номер
 * хвилі в заявці. Кличеться в транзакції рішення — або все, або нічого:
 * покликаний без сповіщення неможливий, а незаписана хвиля повториться.
 * Повертає сповіщення, щоб після коміту розіслати їх подіями.
 */
export async function recordWave(
  tx: Db,
  jobId: string,
  plan: WavePlan,
): Promise<Notification[]> {
  let notices: Notification[] = []

  if (plan.toNotify.length > 0) {
    await tx.dispatchEvent.createMany({
      data: plan.toNotify.map((m) => ({
        jobId,
        masterId: m.id,
        wave: plan.wave,
        score: m.score,
        distanceKm: m.distanceKm,
        beyondReach: m.beyondReach,
      })),
      skipDuplicates: true,
    })
    notices = await tx.notification.createManyAndReturn({
      data: plan.toNotify.map((m) =>
        m.beyondReach
          ? jobOfferNotice(m.id, jobId, plan.jobTitle, m.distanceKm)
          : newJobNotice(m.id, jobId, plan.jobTitle),
      ),
    })
  }

  await tx.job.updateMany({
    where: { id: jobId, dispatchWave: { lt: plan.wave } },
    data: { dispatchWave: plan.wave },
  })
  return notices
}

/** Відгуків досить — хвиль більше не буде, відновленню тут робити нічого. */
export async function finishDispatch(tx: Db, jobId: string): Promise<void> {
  await tx.job.updateMany({
    where: { id: jobId, dispatchWave: { lt: FINAL_WAVE } },
    data: { dispatchWave: FINAL_WAVE },
  })
}

/** Майстер відкрив заявку. Аналітика не має ламати UX — збій ковтаємо. */
export async function markOpened(jobId: string, masterId: string) {
  await prisma.dispatchEvent
    .updateMany({
      where: { jobId, masterId, openedAt: null },
      data: { openedAt: new Date() },
    })
    .catch(() => {})
}

/** Майстер відгукнувся. Саме з цього складається його відзивчивість. */
export async function markResponded(jobId: string, masterId: string) {
  await prisma.dispatchEvent
    .updateMany({
      where: { jobId, masterId, respondedAt: null },
      data: { respondedAt: new Date() },
    })
    .catch(() => {})
}

/**
 * Пропозиції з-за меж виїзду (beyondReach) не рахуються ніде: мовчання на
 * них — не провина майстра, а брак майстрів поруч із заявкою.
 */
const COUNTED = { beyondReach: false } as const

/** Відзивчивість кожного майстра зі списку — одним запитом на всіх. */
export async function loadResponseRates(
  db: Db,
  masterIds: readonly string[],
): Promise<Map<string, number>> {
  if (masterIds.length === 0) return new Map()

  const rows = await db.dispatchEvent.groupBy({
    by: ['masterId'],
    where: { masterId: { in: [...masterIds] }, ...COUNTED },
    _count: { _all: true, respondedAt: true },
  })
  const counted = new Map(rows.map((r) => [r.masterId, r._count]))

  return new Map(
    masterIds.map((id) => {
      const c = counted.get(id)
      return [id, responseRate(c?._all ?? 0, c?.respondedAt ?? 0)]
    }),
  )
}

/** Відзивчивість і недавнє навантаження (після `since`) — двома запитами. */
export async function loadHistory(
  db: Db,
  masterIds: readonly string[],
  since: Date,
): Promise<Map<string, MasterHistory>> {
  if (masterIds.length === 0) return new Map()

  const [rates, recent] = await Promise.all([
    loadResponseRates(db, masterIds),
    db.dispatchEvent.groupBy({
      by: ['masterId'],
      where: {
        masterId: { in: [...masterIds] },
        notifiedAt: { gt: since },
        ...COUNTED,
      },
      _count: { _all: true },
    }),
  ])
  const recentBy = new Map(recent.map((r) => [r.masterId, r._count._all]))

  return new Map(
    masterIds.map((id) => [
      id,
      {
        responseRate: rates.get(id) ?? responseRate(0, 0),
        recent: recentBy.get(id) ?? 0,
      },
    ]),
  )
}
