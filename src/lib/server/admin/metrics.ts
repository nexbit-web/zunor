// Метрики для /admin — те, що MANIFESTO називає головними (розділ 10,
// правило №2: «міряй TTFR щотижня; не знаєш — у тебе проблема»):
//
//   TTFR      — медіана часу від створення заявки до першої пропозиції;
//   fill 10   — частка заявок, на які хтось відгукнувся за 10 хвилин;
//   без відгуку — частка заявок, на які не відгукнувся ніхто;
//   а також заявки, завершені замовлення, активні майстри, нові люди.
//
// Рахується в памʼяті з одного запиту за період: на старті це десятки
// чи сотні заявок. Стеля — щоб «90 днів» на зрілій базі не тягнули все.

import { prisma } from '../prisma'
import { PERIODS, type Period } from '$lib/admin/periods'

export { PERIODS, type Period }

const JOB_CAP = 5_000
const DAY_MS = 86_400_000

export interface Metrics {
  period: Period
  jobs: number
  /** Медіана хвилин до першої пропозиції; null — жодної пропозиції. */
  ttfrMinutes: number | null
  /** 0–1: частка заявок із пропозицією за 10 хв. */
  fill10: number | null
  /** 0–1: частка заявок без жодної пропозиції (серед тих, що старші за добу). */
  noResponse: number | null
  ordersCompleted: number
  activeMasters: number
  newClients: number
  newMasters: number
  /** Заявки по днях, від найстарішого. */
  perDay: { date: string; jobs: number }[]
  /** Заявок більше за стелю — цифри пораховано за останніми JOB_CAP. */
  capped: boolean
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export async function loadMetrics(period: Period, now = new Date()): Promise<Metrics> {
  const days = PERIODS[period]
  const since = new Date(now.getTime() - days * DAY_MS)
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS)

  const [jobs, ordersCompleted, activeMasters, newClients, newMasters] =
    await Promise.all([
      prisma.job.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: JOB_CAP + 1,
        select: {
          createdAt: true,
          proposals: {
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
      prisma.order.count({
        where: { status: 'COMPLETED', completedAt: { gte: since } },
      }),
      // «Активний» — заходив за тиждень і анкета ввімкнена, не забанений.
      prisma.user.count({
        where: {
          role: 'MASTER',
          banned: false,
          lastSeen: { gte: weekAgo },
          masterProfile: { isActive: true },
        },
      }),
      prisma.user.count({
        where: { role: 'CLIENT', banned: false, createdAt: { gte: since } },
      }),
      prisma.user.count({
        where: { role: 'MASTER', banned: false, createdAt: { gte: since } },
      }),
    ])

  const capped = jobs.length > JOB_CAP
  const list = capped ? jobs.slice(0, JOB_CAP) : jobs

  const firstResponse: number[] = []
  let within10 = 0
  let matured = 0
  let maturedSilent = 0

  for (const j of list) {
    const first = j.proposals[0]?.createdAt
    if (first) {
      const minutes = (first.getTime() - j.createdAt.getTime()) / 60_000
      firstResponse.push(minutes)
      if (minutes <= 10) within10++
    }
    // «Без відгуку» рахуємо лише серед заявок, старших за добу: свіжа
    // заявка без пропозицій — ще не провал, у неї ще йдуть хвилі.
    if (now.getTime() - j.createdAt.getTime() > DAY_MS) {
      matured++
      if (!first) maturedSilent++
    }
  }

  // Порожні дні — теж стовпчик (нуль), інакше графік брехав би про ритм.
  const perDayMap = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS)
    perDayMap.set(d.toISOString().slice(0, 10), 0)
  }
  for (const j of list) {
    const key = j.createdAt.toISOString().slice(0, 10)
    if (perDayMap.has(key)) perDayMap.set(key, (perDayMap.get(key) ?? 0) + 1)
  }

  const ttfr = median(firstResponse)

  return {
    period,
    jobs: list.length,
    ttfrMinutes: ttfr === null ? null : Math.round(ttfr),
    fill10: list.length ? within10 / list.length : null,
    noResponse: matured ? maturedSilent / matured : null,
    ordersCompleted,
    activeMasters,
    newClients,
    newMasters,
    perDay: [...perDayMap].map(([date, n]) => ({ date, jobs: n })),
    capped,
  }
}

/** Лічильники для меню адмінки: що чекає на людину. */
export async function adminQueues(): Promise<{
  pendingVerifications: number
  openReports: number
}> {
  const [pendingVerifications, openReports] = await Promise.all([
    prisma.masterProfile.count({
      where: { verificationStatus: 'PENDING', user: { banned: false } },
    }),
    prisma.report.count({ where: { status: 'OPEN' } }),
  ])
  return { pendingVerifications, openReports }
}
