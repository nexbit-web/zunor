// src/routes/(auth)/jobs/+page.server.ts
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

const PAGE_SIZE = 20
type ViewMode = 'mine' | 'feed'

export const load: PageServerLoad = async ({ request, url }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw redirect(302, '/user/login?redirectTo=/jobs')

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

  const requestedView = url.searchParams.get('view') as ViewMode | null
  const view: ViewMode =
    requestedView ?? (user.role === 'MASTER' ? 'feed' : 'mine')

  // Довідники для фільтрів (потрібні лише на feed)
  const [allCategories, allCities] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, name: true },
    }),
    prisma.city.findMany({
      where: { isActive: true },
      orderBy: [{ isCapital: 'desc' }, { name: 'asc' }],
      select: { slug: true, name: true, region: true, isCapital: true },
    }),
  ])

  // ─── MINE ───
  if (view === 'mine') {
    const [first, total] = await Promise.all([
      prisma.job.findMany({
        where: { clientId: userId },
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE + 1,
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
          proposalsCount: true,
          viewsCount: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      prisma.job.groupBy({
        by: ['status'],
        where: { clientId: userId },
        _count: { _all: true },
      }),
    ])

    const hasMore = first.length > PAGE_SIZE
    const items = hasMore ? first.slice(0, PAGE_SIZE) : first
    const nextCursor = hasMore ? items[items.length - 1].id : null

    const countsByStatus = Object.fromEntries(
      total.map((g) => [g.status, g._count._all]),
    )

    return {
      view: 'mine' as const,
      userRole: user.role,
      jobs: items.map((j) => ({
        ...j,
        createdAt: j.createdAt.toISOString(),
        expiresAt: j.expiresAt.toISOString(),
      })),
      nextCursor,
      counts: {
        open: countsByStatus['OPEN'] ?? 0,
        inProgress: countsByStatus['IN_PROGRESS'] ?? 0,
        completed: countsByStatus['COMPLETED'] ?? 0,
        other:
          (countsByStatus['CANCELLED'] ?? 0) + (countsByStatus['EXPIRED'] ?? 0),
        all: total.reduce((a, g) => a + g._count._all, 0),
      },
      filters: {
        categories: allCategories,
        cities: allCities,
      },
      blockReason: null as string | null,
    }
  }

  // ─── FEED ───
  if (user.role !== 'MASTER') {
    throw redirect(302, '/jobs?view=mine')
  }

  const mp = user.masterProfile
  if (!mp?.isActive || mp.verificationStatus !== 'VERIFIED' || !user.city) {
    return {
      view: 'feed' as const,
      userRole: user.role,
      jobs: [],
      nextCursor: null,
      counts: { open: 0, inProgress: 0, completed: 0, other: 0, all: 0 },
      filters: { categories: allCategories, cities: allCities },
      blockReason: !mp?.isActive
        ? 'Профіль майстра неактивний'
        : mp.verificationStatus !== 'VERIFIED'
          ? 'Профіль не верифіковано'
          : 'У профілі не вказано місто',
    }
  }

  if (mp.categories.length === 0) {
    return {
      view: 'feed' as const,
      userRole: user.role,
      jobs: [],
      nextCursor: null,
      counts: { open: 0, inProgress: 0, completed: 0, other: 0, all: 0 },
      filters: { categories: allCategories, cities: allCities },
      blockReason: 'У профілі не вказано категорії',
    }
  }

  const jobs = await prisma.job.findMany({
    where: {
      status: 'OPEN',
      city: user.city,
      category: { in: mp.categories },
      clientId: { not: userId },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
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
      proposalsCount: true,
      viewsCount: true,
      expiresAt: true,
      createdAt: true,
      client: {
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

  const hasMore = jobs.length > PAGE_SIZE
  const items = hasMore ? jobs.slice(0, PAGE_SIZE) : jobs
  const nextCursor = hasMore ? items[items.length - 1].id : null

  // Доступні для майстра категорії (тільки з його профілю)
  const masterCategories = allCategories.filter((c) =>
    mp.categories.includes(c.slug),
  )

  return {
    view: 'feed' as const,
    userRole: user.role,
    jobs: items.map((j) => ({
      ...j,
      createdAt: j.createdAt.toISOString(),
      expiresAt: j.expiresAt.toISOString(),
    })),
    nextCursor,
    counts: {
      open: items.length,
      inProgress: 0,
      completed: 0,
      other: 0,
      all: items.length,
    },
    filters: {
      categories: masterCategories,
      cities: allCities,
    },
    blockReason: null,
  }
}
