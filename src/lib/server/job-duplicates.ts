// * попередження про дубль заявки: другу на те саме найчастіше створюють
// * випадково. Сервер відповідає 409 з тією заявкою, а другу створює після
// * явного `allowDuplicate`. «Те саме» вирішує категорія; рахуються лише живі

import { prisma } from './prisma'
import { matchingFor } from '$lib/categories/matching'
import type { DuplicateJob } from '$lib/types/jobs'

export type { DuplicateJob }

/** Відкритих заявок у клієнта одиниці — стеля лише про запас. */
const MAX_OPEN = 20

interface Candidate {
  id: string
  title: string
  metadata: unknown
  createdAt: Date
}

function kyivToday(now: Date): string {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' })
}

/**
 * Найновіша жива заявка з тим самим ключем, що й нова. `candidates` —
 * відкриті заявки клієнта цієї категорії, від нових до старих.
 */
export function pickDuplicate(
  candidates: readonly Candidate[],
  category: string,
  metadata: unknown,
  now: Date,
): DuplicateJob | null {
  const matching = matchingFor(category)
  const key = matching.duplicateKey(metadata)
  if (key === null) return null

  const today = kyivToday(now)
  for (const c of candidates) {
    if (matching.duplicateKey(c.metadata) !== key) continue
    const day = matching.serviceDay(c.metadata, c.createdAt)
    // * день минув, а заявка ще не прострочена кроном — вона вже не про
    // * цю роботу. ISO-дні порівнюються рядком
    if (day !== null && day < today) continue
    return { id: c.id, title: c.title, day }
  }
  return null
}

/** Дубль нової заявки серед відкритих заявок клієнта або null. */
export async function findDuplicateJob(
  clientId: string,
  category: string,
  metadata: unknown,
  now = new Date(),
): Promise<DuplicateJob | null> {
  // * категорія дублів не розпізнає — і в базу йти нема чого
  if (matchingFor(category).duplicateKey(metadata) === null) return null

  const open = await prisma.job.findMany({
    where: { clientId, category, status: 'OPEN', expiresAt: { gt: now } },
    select: { id: true, title: true, metadata: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_OPEN,
  })
  return pickDuplicate(open, category, metadata, now)
}
