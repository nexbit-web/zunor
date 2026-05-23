// src/routes/(auth)/jobs/new/+page.server.ts
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    throw redirect(302, '/user/login?redirectTo=/jobs/new')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, city: true },
  })

  if (!user) throw redirect(302, '/user/login')

  // Майстри не створюють заявки
  if (user.role === 'MASTER') {
    throw redirect(302, '/dashboard')
  }

  return {
    userCity: user.city ?? null,
  }
}
