import { prisma } from '$lib/server/prisma'
import { markOpened, recommendForJob } from '$lib/server/dispatch'
import { checkJobAccess, jobViewerSelect } from '$lib/server/job-access'
import { getCategories, getCities, getDistricts } from '$lib/server/reference'
import { cityDistricts, jobPlace } from '$lib/geo/districts'

// * заявка з усім, що бачить її сторінка, — одне джерело для сайту й
// * застосунку. null — заявки немає або глядачеві її не можна (обидва — 404)

// * один перегляд на пару (заявка, глядач): повторне відкриття гаситься на INSERT
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
    avatar: string | null
    avgRating: number
    reviewsCount: number
    /** Телефон майстра — лише власникові й лише в живій або прийнятій пропозиції. */
    phone?: string | null
  }
}

/** Номер у пропозиції видно, поки вона SENT або ACCEPTED. */
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
    /** Людина відкрила заявку: унікальний перегляд і «майстер відкрив» — обидва ідемпотентні. */
    track?: boolean
  } = {},
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...jobViewerSelect,
      // * для підпису «≈4 км» біля району заявки
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

  const { canView, isOwner, isMaster } = await checkJobAccess(job, {
    id: userId,
    ...user,
  })
  if (!canView) return null

  // * назви категорії й міста — з кешу довідників, без запитів у базу
  const [categories, cities, allDistricts] = await Promise.all([
    getCategories(),
    getCities(),
    getDistricts(),
  ])
  const categoryRow = categories.find((c) => c.slug === job.category)
  const cityRow = cities.find((c) => c.slug === job.city)

  if (opts.track) {
    // * перегляди — лише не власника, не блокуючи відповідь
    if (!isOwner) countUniqueView(job.id, userId).catch(() => {})
    // * памʼять диспетчера: майстер відкрив розіслану йому заявку
    if (isMaster && !isOwner) markOpened(job.id, userId).catch(() => {})
  }

  // * власник бачить усі пропозиції, майстер — лише свою
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

    // * топ-3 і слот новачку — тими самими вагами, що й розсилка
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
            avatar: mine.master.avatar,
            avgRating: mine.master.avgRatingAsMaster,
            reviewsCount: mine.master.reviewsCountAsMaster,
          },
        },
      ]
    }
  }

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
    // * район, а не адреса: точну адресу клієнт дає в чаті після угоди
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
