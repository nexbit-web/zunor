// src/routes/(auth)/onboarding/+page.server.ts
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw redirect(302, '/user/login?redirectTo=/onboarding')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      phone: true,
      avatar: true,
      avatarPublicId: true,
      city: true,
      role: true,
      masterProfile: {
        select: {
          categories: true,
          description: true,
          portfolioImages: true,
          portfolioImagesPublicIds: true,
          verificationStatus: true,
          verificationRejectReason: true,
        },
      },
    },
  })

  if (!user) throw redirect(302, '/user/login')
  if (user.role !== 'MASTER') throw redirect(302, '/dashboard')

  const [categories, cities] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, name: true, icon: true },
    }),
    prisma.city.findMany({
      where: { isActive: true },
      orderBy: [{ isCapital: 'desc' }, { name: 'asc' }],
      select: { slug: true, name: true, region: true, isCapital: true },
    }),
  ])

  return { user, categories, cities }
}
