import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { error, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import type {
  ClientProfileData,
  ProfileReview,
} from '$lib/components/profile/types'

async function loadClientReviews(clientId: string): Promise<ProfileReview[]> {
  const reviews = await prisma.review.findMany({
    where: { direction: 'MASTER_TO_CLIENT', order: { clientId } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { author: { select: { id: true, name: true } } },
  })
  return reviews.map((r) => {
    const name = r.author.name ?? 'Користувач'
    return {
      id: r.id,
      authorName: name,
      authorInitials: name[0]?.toUpperCase() ?? '?',
      rating: r.rating,
      text: r.comment ?? '',
      createdAt: r.createdAt.toISOString(),
    }
  })
}

export const load: PageServerLoad = async ({ params, request, setHeaders }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(404, 'Користувача не знайдено')

  // Свій профіль → на дашборд
  if (params.id === session.user.id) throw redirect(302, '/dashboard')

  // Дивитися профіль клієнта може лише майстер
  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  })
  if (viewer?.role !== 'MASTER') throw error(404, 'Користувача не знайдено')

  // Клієнт за id (БЕЗ телефону — приватний до вибору)
  const [client, reviews, totalOrders, completedOrders] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        role: true,
        name: true,
        avatar: true,
        bio: true,
        city: true,
        createdAt: true,
        avgRating: true,
        reviewsCount: true,
      },
    }),
    loadClientReviews(params.id),
    prisma.order.count({ where: { clientId: params.id } }),
    prisma.order.count({
      where: { clientId: params.id, status: 'COMPLETED' },
    }),
  ])

  if (!client || client.role !== 'CLIENT') {
    throw error(404, 'Користувача не знайдено')
  }

  // Назва міста українською (slug → name)
  const cityRow = client.city
    ? await prisma.city.findUnique({
        where: { slug: client.city },
        select: { name: true },
      })
    : null
  const cityName = cityRow?.name ?? client.city ?? undefined

  setHeaders({
    'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex, nofollow',
  })

  const user: ClientProfileData = {
    id: client.id,
    name: client.name ?? '',
    avatar: client.avatar ?? undefined,
    bio: client.bio ?? undefined,
    phone: null,
    city: cityName,
    createdAt: client.createdAt.toISOString(),
    totalOrders,
    completedOrders,
    avgRating: client.avgRating,
    reviewsCount: client.reviewsCount,
    reviews,
  }

  return {
    user,
    isOwner: false as const,
    isAuthenticated: true as const,
  }
}
