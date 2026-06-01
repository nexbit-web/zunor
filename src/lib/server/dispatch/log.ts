// src/lib/server/dispatch/log.ts
//
// Пам'ять мозку. Записує кожне рішення про уведомлення.
// Ці дані — фундамент для майбутнього ML (Етап 4).

import { prisma } from '$lib/prisma'
import type { ScoredCandidate } from './types'

/**
 * Записує факт уведомлення майстрів у межах однієї хвилі.
 * Використовує createMany — один запит на всю хвилю.
 */
export async function logDispatch(
  jobId: string,
  wave: number,
  candidates: ScoredCandidate[],
): Promise<void> {
  if (candidates.length === 0) return

  await prisma.dispatchEvent.createMany({
    data: candidates.map((c) => ({
      jobId,
      masterId: c.id,
      wave,
      score: c.score,
    })),
    skipDuplicates: true, // захист від гонок (unique [jobId, masterId])
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
