import { prisma } from '$lib/server/prisma'
import { markOpened, recommendForJob } from '$lib/server/dispatch'
import { checkJobAccess, jobViewerSelect } from '$lib/server/job-access'
import { getDistricts } from '$lib/server/reference'
import { cityDistricts, jobPlace } from '$lib/geo/districts'

/**
 * Заявка з усім, що бачить її сторінка: сама заявка, пропозиції (власник —
 * усі з позначками «Рекомендуємо» / «Новачок», майстер — лише свою), чи
 * може майстер відгукнутись. Одне джерело для сторінки сайту
 * (dashboard/jobs/[id]) і GET /api/jobs/[id] (застосунок) — щоб екран
 * заявки в застосунку показував те саме, що й сайт.
 *
 * Доступ — правило $lib/server/job-access. null — заявки немає або
 * глядачеві її бачити не можна (обидва — 404: інакше відповідь
 * підтверджувала б існування чужої заявки).
 */

/**
 * Один унікальний перегляд на пару (заявка, глядач).
 * Повторне відкриття не доходить до UPDATE — конфлікт по unique гаситься
 * на рівні INSERT, і «гаряча» заявка не переписується щоразу.
 */
async function countUniqueView(jobId: string, viewerId: string) {
  const inserted = await prisma.jobView.createMany({
    data: [{ jobId, viewerId }],
    skipDuplicates: true,
  })
  if (inserted.count === 0) return

  await prisma.job.update({
    where: { id: jobId },
    data: { viewsCount: { increment: 1 } },
  })
}

export interface JobDetailProposal {
  id: string
  message: string
  priceCents: number
  estimatedDays: number
  status: string
  createdAt: string
  recommended?: boolean
  isNew?: boolean
  master: {
    id: string
    name: string | null
    username: string | null
    avatar: string | null
    avgRating: number
    reviewsCount: number
    /**
     * Телефон майстра — лише власникові заявки й лише в живій або
     * прийнятій пропозиції (proposalPhone). Клієнт дзвонить, щоб
     * домовитись про ціну ще до вибору (власник), а відкликана чи
     * відхилена пропозиція номера вже не показує.
     */
    phone?: string | null
  }
}

/**
 * Номер майстра в пропозиції: видно, поки пропозиція жива (SENT) або
 * прийнята. Відкликаний чи відхилений відгук — це вже не пропозиція, і
 * номер у ньому ні до чого.
 */
export function proposalPhone(
  status: string,
  phone: string | null | undefined,
): string | null {
  return status === 'SENT' || status === 'ACCEPTED' ? (phone ?? null) : null
}

export async function loadJobDetail(
  jobId: string,
  userId: string,
  opts: {
    /**
     * Людина ВІДКРИЛА заявку (сторінка, екран застосунку): рахуємо
     * унікальний перегляд і памʼять диспетчера «майстер відкрив». Обидва —
     * ідемпотентні, повторне відкриття нічого не накручує.
     */
    track?: boolean
  } = {},
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...jobViewerSelect,
      // Район глядача — лише для підпису «≈4 км» біля району заявки.
      district: true,
      masterProfile: {
        select: {
          isActive: true,
          verificationStatus: true,
          categories: true,
        },
      },
    },
  })
  if (!user) return null

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      // Номер для людей (schema.prisma, Job.number).
      number: true,
      title: true,
      description: true,
      category: true,
      city: true,
      district: true,
      status: true,
      budgetMinCents: true,
      budgetMaxCents: true,
      currency: true,
      attachments: true,
      metadata: true,
      effort: true,
      proposalsCount: true,
      viewsCount: true,
      expiresAt: true,
      closedAt: true,
      editedAt: true,
      createdAt: true,
      clientId: true,
      client: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          city: true,
          avgRatingAsClient: true,
          reviewsCountAsClient: true,
          createdAt: true,
        },
      },
    },
  })
  if (!job) return null

  // ─── Контроль доступу ───
  const { canView, isOwner, isMaster } = await checkJobAccess(job, {
    id: userId,
    ...user,
  })
  if (!canView) return null

  // Людиночитні назви для категорії та міста (slug → name)
  const [categoryRow, cityRow, allDistricts] = await Promise.all([
    prisma.category.findUnique({
      where: { slug: job.category },
      select: { name: true },
    }),
    prisma.city.findUnique({
      where: { slug: job.city },
      select: { name: true, region: true },
    }),
    getDistricts(),
  ])

  if (opts.track) {
    // Лічильник переглядів — лише для не-власника, не блокуючи відповідь.
    if (!isOwner) countUniqueView(job.id, userId).catch(() => {})
    // Памʼять диспетчера: майстер відкрив розіслану йому заявку.
    if (isMaster && !isOwner) markOpened(job.id, userId).catch(() => {})
  }

  // Пропозиції: власник бачить усі, майстер — лише свою.
  let proposals: JobDetailProposal[] = []

  if (isOwner) {
    const items = await prisma.proposal.findMany({
      where: { jobId: job.id },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        message: true,
        priceCents: true,
        estimatedDays: true,
        status: true,
        createdAt: true,
        master: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            phone: true,
            avgRatingAsMaster: true,
            reviewsCountAsMaster: true,
            lastSeen: true,
            city: true,
            district: true,
            masterProfile: {
              select: {
                verificationStatus: true,
                completedOrders: true,
                createdAt: true,
                hasVehicle: true,
                crew: true,
              },
            },
            _count: {
              select: {
                masterOrders: {
                  where: { status: { in: ['CREATED', 'IN_PROGRESS'] } },
                },
              },
            },
          },
        },
      },
    })

    // Топ-3 + слот новачку — тими самими вагами, що й розсилка.
    const now = new Date()
    const { recommended: recommendedIds, newbies: newbieIds } =
      await recommendForJob(
        job,
        items.map((p) => ({
          id: p.id,
          createdAt: p.createdAt,
          master: {
            id: p.master.id,
            city: p.master.city,
            district: p.master.district,
            lastSeen: p.master.lastSeen,
            avgRating: p.master.avgRatingAsMaster,
            isVerified:
              p.master.masterProfile?.verificationStatus === 'VERIFIED',
            activeOrders: p.master._count.masterOrders,
            masterSince: p.master.masterProfile?.createdAt ?? now,
            completedOrders: p.master.masterProfile?.completedOrders ?? 0,
            hasVehicle: p.master.masterProfile?.hasVehicle,
            crew: p.master.masterProfile?.crew,
          },
        })),
        now,
      )

    proposals = items.map((p) => ({
      id: p.id,
      message: p.message,
      priceCents: p.priceCents,
      estimatedDays: p.estimatedDays,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      recommended: recommendedIds.has(p.id),
      isNew: newbieIds.has(p.id),
      master: {
        id: p.master.id,
        name: p.master.name,
        username: p.master.username,
        avatar: p.master.avatar,
        avgRating: p.master.avgRatingAsMaster,
        reviewsCount: p.master.reviewsCountAsMaster,
        phone: proposalPhone(p.status, p.master.phone),
      },
    }))
  } else if (isMaster) {
    const mine = await prisma.proposal.findFirst({
      where: { jobId: job.id, masterId: userId },
      select: {
        id: true,
        message: true,
        priceCents: true,
        estimatedDays: true,
        status: true,
        createdAt: true,
        master: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            avgRatingAsMaster: true,
            reviewsCountAsMaster: true,
          },
        },
      },
    })
    if (mine) {
      proposals = [
        {
          id: mine.id,
          message: mine.message,
          priceCents: mine.priceCents,
          estimatedDays: mine.estimatedDays,
          status: mine.status,
          createdAt: mine.createdAt.toISOString(),
          master: {
            id: mine.master.id,
            name: mine.master.name,
            username: mine.master.username,
            avatar: mine.master.avatar,
            avgRating: mine.master.avgRatingAsMaster,
            reviewsCount: mine.master.reviewsCountAsMaster,
          },
        },
      ]
    }
  }

  // Чи може майстер подати пропозицію?
  let canPropose = false
  let cantProposeReason: string | null = null

  if (isMaster && !isOwner) {
    if (job.status !== 'OPEN') {
      cantProposeReason = 'Заявка вже не приймає пропозицій'
    } else if (proposals.length > 0) {
      cantProposeReason = 'Ви вже подали пропозицію'
    } else if (!user.masterProfile?.isActive) {
      cantProposeReason = 'Профіль майстра неактивний'
    } else if (!user.masterProfile.categories.includes(job.category)) {
      cantProposeReason = 'Ця категорія не у вашому профілі'
    } else {
      canPropose = true
    }
  }

  return {
    job,
    categoryName: categoryRow?.name ?? job.category,
    cityName: cityRow?.name ?? job.city,
    // Район, а не адреса: точну адресу клієнт дає в чаті після угоди.
    place: jobPlace(
      cityDistricts(allDistricts, job.city),
      job.district,
      user.city === job.city ? user.district : null,
    ),
    proposals,
    isOwner,
    isMaster,
    canPropose,
    cantProposeReason,
  }
}
