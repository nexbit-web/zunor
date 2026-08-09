// Пам'ять мозку. Записує кожне рішення про уведомлення.
// Ці дані — фундамент для відзивчивості та майбутнього ML.

import { prisma } from '../prisma'
import type { ScoredCandidate } from './types'
import type { Db } from './engine'

/**
 * Столбить факт уведомлення майстрів у межах однієї хвилі (один запит).
 * Приймає `db` — index.ts передає tx, щоб claim був усередині advisory-лока
 * і виконувався ДО реальної відправки пушів (захист від дублів при збої).
 */
export async function logDispatch(
  jobId: string,
  wave: number,
  candidates: ScoredCandidate[],
  db: Db = prisma,
): Promise<void> {
  if (candidates.length === 0) return

  await db.dispatchEvent.createMany({
    data: candidates.map((c) => ({
      jobId,
      masterId: c.id,
      wave,
      score: c.score,
    })),
    skipDuplicates: true, // підстраховка поверх unique [jobId, masterId]
  })
}

/** Майстер відкрив заявку — фіксуємо (для аналітики відгукуваності). */
export async function markOpened(
  jobId: string,
  masterId: string,
): Promise<void> {
  await prisma.dispatchEvent
    .updateMany({
      where: { jobId, masterId, openedAt: null },
      data: { openedAt: new Date() },
    })
    .catch(() => {}) // fail-soft: аналітика не має ламати UX
}

/** Майстер залишив відгук — фіксуємо (ключова метрика якості dispatch). */
export async function markResponded(
  jobId: string,
  masterId: string,
): Promise<void> {
  await prisma.dispatchEvent
    .updateMany({
      where: { jobId, masterId, respondedAt: null },
      data: { respondedAt: new Date() },
    })
    .catch(() => {})
}
