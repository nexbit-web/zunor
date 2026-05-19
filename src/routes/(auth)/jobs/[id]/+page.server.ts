// src/routes/(auth)/jobs/[id]/+page.server.ts
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { error, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw redirect(302, '/user/login')

  const userId = session.user.id

  // Користувач (потрібна роль, щоб правильно показати UI)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
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

  // Заявка
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
          avgRating: true,
          reviewsCount: true,
          createdAt: true,
        },
      },
    },
  })

  if (!job) throw error(404, 'Заявку не знайдено')

  // ─── Подтягиваем human-readable имена для category и city ───
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

  if (!job) throw error(404, 'Заявку не знайдено')

  const isOwner = job.clientId === userId
  const isMaster = user.role === 'MASTER'

  // Збільшуємо лічильник переглядів (тільки для не-власника, не блокуючи)
  if (!isOwner) {
    prisma.job
      .update({
        where: { id: job.id },
        data: { viewsCount: { increment: 1 } },
      })
      .catch(() => {})
  }

  // Пропозиції — клієнт бачить всі, майстер бачить тільки свою
  let proposals: Array<{
    id: string
    message: string
    priceCents: number
    estimatedDays: number
    status: string
    createdAt: string
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
            avgRating: true,
            reviewsCount: true,
          },
        },
      },
    })
    proposals = items.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
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
            avgRating: true,
            reviewsCount: true,
          },
        },
      },
    })
    if (mine) {
      proposals = [
        {
          ...mine,
          createdAt: mine.createdAt.toISOString(),
        },
      ]
    }
  }

  // Може майстер подати пропозицію?
  let canPropose = false
  let cantProposeReason: string | null = null

  if (isMaster && !isOwner) {
    if (job.status !== 'OPEN') {
      canPropose = false
      cantProposeReason = 'Заявка вже не приймає пропозицій'
    } else if (proposals.length > 0) {
      canPropose = false
      cantProposeReason = 'Ви вже подали пропозицію'
    } else if (!user.masterProfile?.isActive) {
      canPropose = false
      cantProposeReason = 'Профіль майстра неактивний'
    } else if (user.masterProfile.verificationStatus !== 'VERIFIED') {
      canPropose = false
      cantProposeReason = 'Профіль не верифіковано'
    } else if (!user.masterProfile.categories.includes(job.category)) {
      canPropose = false
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
