// Аналітика майстра: тільки числа про його власні результати.
// Раніше цей роут звався /dashboard/proposals і показував список відгуків —
// але відгук веде або в заявку, або в замовлення, і обидва шляхи вже є
// в навігації.

import { prisma } from '$lib/server/prisma'
import { requireRole } from '$lib/server/guard'
import type { PageServerLoad } from './$types'

/** Медіана, а не середнє: один відгук через три доби зсуває середнє так,
 *  що число перестає описувати звичайний день. */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

/** Стеля на діапазон: сам по собі він лише звужує вибірку, але дозволяти
 *  довільні роки в запиті означає дозволити скан усієї таблиці. */
const MAX_RANGE_DAYS = 366

/**
 * 'YYYY-MM-DD' → північ цього дня в UTC.
 *
 * Свідомо UTC, а не локальний час процесу: інакше та сама адреса давала б
 * різні числа залежно від того, у якій зоні підняли сервер, і межа місяця
 * «пливла» б на кілька годин.
 */
function parseDay(value: string | null): Date | null {
  if (!value || !DAY_RE.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isNaN(ms) ? null : new Date(ms)
}

function toDayString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Межі поточного календарного місяця. Рахуються на кожен запит, тож
 *  першого числа сторінка сама починає показувати новий місяць. */
function currentMonth(now: Date): { from: Date; toExclusive: Date } {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  return {
    from: new Date(Date.UTC(y, m, 1)),
    toExclusive: new Date(Date.UTC(y, m + 1, 1)),
  }
}

export const load: PageServerLoad = async ({ locals, url }) => {
  // Сторінка МАЙСТРА. Клієнта сюди не пускаємо (раніше він проходив
  // перевірку й бачив порожній список — тепер редірект на дашборд).
  const user = await requireRole(locals, ['MASTER'], '/dashboard/analytics')

  const fallback = currentMonth(new Date())

  const rawFrom = parseDay(url.searchParams.get('from'))
  const rawTo = parseDay(url.searchParams.get('to'))

  let from = fallback.from
  // Верхня межа ЕКСКЛЮЗИВНА: у БД порівнюємо `lt`, тож останній день
  // періоду входить у вибірку цілком, разом із вечором.
  let toExclusive = fallback.toExclusive

  if (rawFrom && rawTo && rawTo.getTime() >= rawFrom.getTime()) {
    if (rawTo.getTime() - rawFrom.getTime() <= MAX_RANGE_DAYS * DAY_MS) {
      from = rawFrom
      toExclusive = new Date(rawTo.getTime() + DAY_MS)
    }
  }

  const period = { gte: from, lt: toExclusive }

  const [proposals, completed, cancelledCount, active, profile] =
    await Promise.all([
      // Свої ж рядки, по чотири поля: порахувати статуси й час реакції в JS
      // дешевше, ніж кілька окремих проходів по БД за тим самим набором.
      prisma.proposal.findMany({
        where: { masterId: user.id, createdAt: period },
        select: {
          status: true,
          priceCents: true,
          createdAt: true,
          job: { select: { createdAt: true } },
        },
      }),

      // Завершені й зароблене — за датою ЗАВЕРШЕННЯ, не створення.
      // Замовлення, взяте в квітні й здане в травні, — це травневий
      // заробіток; інакше «скільки я заробив цього місяця» відповідало б
      // на зовсім інше питання.
      prisma.order.aggregate({
        where: { masterId: user.id, status: 'COMPLETED', completedAt: period },
        _count: { _all: true },
        _sum: { priceCents: true },
      }),

      prisma.order.count({
        where: { masterId: user.id, status: 'CANCELLED', cancelledAt: period },
      }),

      // «Зараз у роботі» — це поточний стан, а не подія періоду, тож
      // фільтра по датах тут немає. На сторінці це підписано.
      prisma.order.aggregate({
        where: {
          masterId: user.id,
          status: { in: ['CREATED', 'IN_PROGRESS'] },
        },
        _count: { _all: true },
        _sum: { priceCents: true },
      }),

      // Рейтинг уже денормалізований у User — агрегувати Review зайве.
      // Він завжди за весь час: репутація не ділиться на місяці.
      prisma.user.findUnique({
        where: { id: user.id },
        select: { avgRatingAsMaster: true, reviewsCountAsMaster: true },
      }),
    ])

  // ─── Відгуки ───
  const byStatus = { SENT: 0, ACCEPTED: 0, REJECTED: 0, WITHDRAWN: 0 }
  let priceSum = 0
  const responseMinutes: number[] = []

  for (const p of proposals) {
    if (p.status in byStatus) byStatus[p.status as keyof typeof byStatus]++
    priceSum += p.priceCents

    const minutes = (p.createdAt.getTime() - p.job.createdAt.getTime()) / 60_000
    // Відʼємне значення можливе лише при рознесених годинниках — відкидаємо,
    // щоб один такий рядок не зіпсував медіану.
    if (minutes >= 0) responseMinutes.push(minutes)
  }

  const proposalsTotal = proposals.length

  // Конверсія рахується від ВИРІШЕНИХ відгуків. Якби в знаменник ішли ще й
  // ті, що чекають, число падало б щоразу, коли майстер просто відгукнувся, —
  // і виглядало б як погіршення роботи.
  const decided = byStatus.ACCEPTED + byStatus.REJECTED

  const completedCount = completed._count._all
  const earnedCents = completed._sum.priceCents ?? 0
  const closed = completedCount + cancelledCount

  return {
    period: {
      from: toDayString(from),
      // Назад віддаємо ВКЛЮЧНУ дату — саме її бачить людина в календарі.
      to: toDayString(new Date(toExclusive.getTime() - DAY_MS)),
      isCurrentMonth:
        from.getTime() === fallback.from.getTime() &&
        toExclusive.getTime() === fallback.toExclusive.getTime(),
    },

    // Порожній стан — коли за період не сталося геть нічого.
    hasData: proposalsTotal > 0 || closed > 0 || active._count._all > 0,

    proposals: {
      total: proposalsTotal,
      accepted: byStatus.ACCEPTED,
      rejected: byStatus.REJECTED,
      pending: byStatus.SENT,
      withdrawn: byStatus.WITHDRAWN,
      /** null — ще жоден відгук не вирішено, відсотка просто не існує. */
      conversion: decided > 0 ? byStatus.ACCEPTED / decided : null,
      avgPriceCents: proposalsTotal > 0 ? priceSum / proposalsTotal : 0,
      medianResponseMinutes: median(responseMinutes),
    },

    orders: {
      completed: completedCount,
      cancelled: cancelledCount,
      active: active._count._all,
      /** Доля доведених до кінця серед закритих за період. */
      finishRate: closed > 0 ? completedCount / closed : null,
    },

    money: {
      earnedCents,
      inWorkCents: active._sum.priceCents ?? 0,
      avgCheckCents: completedCount > 0 ? earnedCents / completedCount : 0,
    },

    rating: {
      value: profile?.avgRatingAsMaster ?? 0,
      count: profile?.reviewsCountAsMaster ?? 0,
    },
  }
}
