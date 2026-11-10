// Що з відкритих заявок майстер бачить у стрічці. Стрічка не обганяє
// розсилку: свіжу заявку бачить лише покликаний, після останньої хвилі —
// усі, кому вона в межах виїзду. Покликаний бачить свою заявку завжди,
// навіть якщо її привела до нього остання хвиля з-за меж.
//
// Чого майстер не робить (categories/matching) — у стрічці немає зовсім,
// як і в розсилці: інакше «миє лише вікна» гортав би генеральні.

import { districtsWithin, type District } from '$lib/geo/districts'
import { matchingFor, type JobCondition } from '$lib/categories/matching'
import { parseMasterSkills } from '$lib/masters/meta'
import { JOB_LIFETIME_MS } from '../job-lifetime'
import { WAVES_DONE_MIN } from './core/waves'
import { prisma } from './data/db'
import type { Prisma } from '../../../generated/prisma/client'

/** Стеля списку «мене кликали» — він іде в IN-запит стрічки. */
const CALLED_LIMIT = 500

export interface FeedScope {
  /** Заявки з «чорною міткою» майстра — не показуємо ніколи. */
  readonly declinedIds: string[]
  /** Умови до where стрічки — іти в AND. */
  readonly where: Prisma.JobWhereInput[]
}

/**
 * Райони, заявки з яких підходять майстру за його межею виїзду. null —
 * фільтра немає: «будь-де», район невідомий або в міста немає районів.
 */
export function reachableDistricts(
  districts: readonly District[],
  masterDistrict: string | null,
  travelRadiusKm: number | null,
): string[] | null {
  if (travelRadiusKm === null) return null
  const near = districtsWithin(districts, masterDistrict, travelRadiusKm)
  return near.length > 0 ? near.map((d) => d.slug) : null
}

/** Умова категорії → Prisma: значення поля metadata — одне з anyOf. */
function conditionWhere(c: JobCondition): Prisma.JobWhereInput {
  return {
    OR: c.anyOf.map((value) => ({
      metadata: { path: [c.field], equals: value },
    })),
  }
}

/**
 * Уміння майстра як умови на заявки: для кожної його категорії з
 * умовами — «це інша категорія АБО всі умови виконані».
 */
export function skillsWhere(
  categories: readonly string[],
  masterMeta: unknown,
): Prisma.JobWhereInput[] {
  const skills = parseMasterSkills(masterMeta)
  return categories.flatMap((category) => {
    const conditions = matchingFor(category).conditions(skills[category])
    if (conditions.length === 0) return []
    return [
      {
        OR: [
          { category: { not: category } },
          { AND: conditions.map(conditionWhere) },
        ],
      },
    ]
  })
}

export async function masterFeedScope(opts: {
  masterId: string
  masterDistrict: string | null
  travelRadiusKm: number | null
  /** Райони міста майстра. */
  districts: readonly District[]
  /** Категорії майстра й MasterProfile.metadata — для умінь. */
  categories?: readonly string[]
  masterMeta?: unknown
  now?: Date
}): Promise<FeedScope> {
  const now = opts.now ?? new Date()
  const wavesDoneAt = new Date(now.getTime() - WAVES_DONE_MIN * 60_000)

  // Відмови — за весь час; покликання — за життя заявки: старші вже не
  // відкриті, а список іде в IN.
  const events = await prisma.dispatchEvent.findMany({
    where: {
      masterId: opts.masterId,
      OR: [
        { declined: true },
        { notifiedAt: { gte: new Date(now.getTime() - JOB_LIFETIME_MS) } },
      ],
    },
    select: { jobId: true, declined: true },
    orderBy: { notifiedAt: 'desc' },
    take: CALLED_LIMIT,
  })
  const declinedIds = events.filter((e) => e.declined).map((e) => e.jobId)
  const calledIds = events.filter((e) => !e.declined).map((e) => e.jobId)

  const reach = reachableDistricts(
    opts.districts,
    opts.masterDistrict,
    opts.travelRadiusKm,
  )
  // Без району або з вимкненим районом відстань не перевірити — не
  // ховаємо, як і розсилка.
  const inReach: Prisma.JobWhereInput[] = reach
    ? [
        {
          OR: [
            { district: { in: reach } },
            { district: null },
            { district: { notIn: opts.districts.map((d) => d.slug) } },
          ],
        },
      ]
    : []

  const open: Prisma.JobWhereInput = {
    AND: [{ createdAt: { lte: wavesDoneAt } }, ...inReach],
  }

  return {
    declinedIds,
    where: [
      calledIds.length > 0 ? { OR: [{ id: { in: calledIds } }, open] } : open,
      ...skillsWhere(opts.categories ?? [], opts.masterMeta),
    ],
  }
}
