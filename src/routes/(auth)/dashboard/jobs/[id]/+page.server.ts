// src/routes/(auth)/jobs/[id]/+page.server.ts
import { auth } from '$lib/server/auth'
import { prisma } from '$lib/server/prisma'
import { error, redirect } from '@sveltejs/kit'
import { markOpened } from '$lib/server/dispatch'
import { getRecommendedIds } from '$lib/server/ranking'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw redirect(302, '/user/login')

  const userId = session.user.id

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      city: true,
      masterProfile: {
        select: {
          isActive: true,
          verificationStatus: true,
          categories: true,
        },
      },
    },
  })
  if (!user) throw redirect(302, '/user/login')

  const job = await prisma.job.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      city: true,
      status: true,
      budgetMinCents: true,
      budgetMaxCents: true,
      currency: true,
      attachments: true,
      metadata: true,
      proposalsCount: true,
      viewsCount: true,
      expiresAt: true,
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

  if (!job) throw error(404, 'Заявку не знайдено')

  const isOwner = job.clientId === userId
  const isMaster = user.role === 'MASTER'

  // ─── Контроль доступу ───
  // Заявку (зокрема фото приміщень клієнта) бачить лише власник або
  // релевантний майстер: відкрита заявка його міста й категорії (як у стрічці)
  // АБО заявка, на яку він уже подавав пропозицію. Інакше 404 — не розкриваємо
  // навіть існування чужої заявки.
  let canView = isOwner
  if (!canView && isMaster) {
    const mp = user.masterProfile
    const eligibleFromFeed =
      !!mp?.isActive &&
      job.status === 'OPEN' &&
      user.city === job.city &&
      mp.categories.includes(job.category)

    if (eligibleFromFeed) {
      canView = true
    } else {
      const ownProposal = await prisma.proposal.findFirst({
        where: { jobId: job.id, masterId: userId },
        select: { id: true },
      })
      canView = !!ownProposal
    }
  }
  if (!canView) throw error(404, 'Заявку не знайдено')

  // Людиночитні назви для категорії та міста (slug → name)
  const [categoryRow, cityRow] = await Promise.all([
    prisma.category.findUnique({
      where: { slug: job.category },
      select: { name: true },
    }),
    prisma.city.findUnique({
      where: { slug: job.city },
      select: { name: true, region: true },
    }),
  ])

  const categoryName = categoryRow?.name ?? job.category
  const cityName = cityRow?.name ?? job.city

  // Лічильник переглядів — лише для не-власника, не блокуючи відповідь.
  if (!isOwner) {
    prisma.job
      .update({
        where: { id: job.id },
        data: { viewsCount: { increment: 1 } },
      })
      .catch(() => {})
  }

  // Память диспетчера: майстер відкрив розіслану йому заявку.
  if (isMaster && !isOwner) {
    markOpened(job.id, userId).catch(() => {})
  }

  // Пропозиції: власник бачить усі, майстер — лише свою.
  let proposals: Array<{
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
    }
  }> = []

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
            avgRatingAsMaster: true,
            reviewsCountAsMaster: true,
            lastSeen: true,
            masterProfile: {
              select: {
                verificationStatus: true,
                completedOrders: true,
                createdAt: true,
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

    // Ранжування: топ-3 + слот новачку.
    const now = new Date()
    const { recommended: recommendedIds, newbies: newbieIds } =
      getRecommendedIds(
        items.map((p) => ({
          id: p.id,
          createdAt: p.createdAt,
          master: {
            lastSeen: p.master.lastSeen,
            avgRating: p.master.avgRatingAsMaster,
            isVerified:
              p.master.masterProfile?.verificationStatus === 'VERIFIED',
            activeOrders: p.master._count.masterOrders,
            masterSince: p.master.masterProfile?.createdAt ?? now,
            completedOrders: p.master.masterProfile?.completedOrders ?? 0,
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
    job: {
      ...job,
      category: categoryName,
      categorySlug: job.category,
      city: cityName,
      citySlug: job.city,
      createdAt: job.createdAt.toISOString(),
      expiresAt: job.expiresAt.toISOString(),
      client: {
        ...job.client,
        avgRating: job.client.avgRatingAsClient,
        reviewsCount: job.client.reviewsCountAsClient,
        createdAt: job.client.createdAt.toISOString(),
      },
    },
    proposals,
    viewerId: userId,
    isOwner,
    isMaster,
    canPropose,
    cantProposeReason,
  }
}
