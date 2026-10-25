// Які відгуки клієнт бачить першими: топ за тим самим балом, що й у
// розсилці, і одне місце в топі гарантовано новачку.

import { isNewMaster, masterScore } from './score'
import type { RankableProposal, Recommendation } from '../types'

const TOP_N = 3

export function recommend(
  proposals: readonly RankableProposal[],
  now: Date = new Date(),
): Recommendation {
  const ranked = proposals
    .map((p) => ({
      id: p.id,
      score: masterScore(p.master, now),
      respondedAt: p.createdAt.getTime(),
      isNew: isNewMaster(p.master, now),
    }))
    // За рівного балу вище той, хто відгукнувся раніше.
    .sort((a, b) => b.score - a.score || a.respondedAt - b.respondedAt)

  const top = ranked.slice(0, TOP_N)
  const recommended = new Set(top.map((p) => p.id))

  const newbie = top.some((p) => p.isNew)
    ? undefined
    : ranked.slice(TOP_N).find((p) => p.isNew)
  if (newbie && top.length === TOP_N) {
    recommended.delete(top[TOP_N - 1].id)
    recommended.add(newbie.id)
  }

  return {
    recommended,
    newbies: new Set(ranked.filter((p) => p.isNew).map((p) => p.id)),
  }
}
