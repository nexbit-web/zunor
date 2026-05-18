// src/routes/(auth)/jobs/new/+page.server.ts
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    throw redirect(302, '/user/login?redirectTo=/orders/new')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, city: true },
  })

  if (!user) throw redirect(302, '/user/login')

  // Майстри не створюють замовлення
  if (user.role === 'MASTER') {
    throw redirect(302, '/dashboard')
  }

  const [categories, cities] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        icon: true,
      },
    }),
    prisma.city.findMany({
      where: { isActive: true },
      orderBy: [{ isCapital: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        region: true,
        isCapital: true,
      },
    }),
  ])

  return {
    categories,
    cities,
    userCity: user.city ?? null,
  }
}
