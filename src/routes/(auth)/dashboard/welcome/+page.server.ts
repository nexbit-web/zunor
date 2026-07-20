// src/routes/(auth)/welcome/+page.server.ts
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw redirect(302, '/user/login?redirectTo=/welcome')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      phone: true,
      avatar: true,
      city: true,
      bio: true,
      role: true,
    },
  })

  if (!user) throw redirect(302, '/user/login')

  // Мастер сюда не заходит — его профиль редактируется на /onboarding.
  if (user.role === 'MASTER') throw redirect(302, '/onboarding')

  // Клиента НЕ редиректим, даже если профиль уже заполнен:
  // /welcome — это и первичное знакомство, и страница редактирования
  // (кнопка «Редагувати профіль» ведёт сюда). Форма приходит предзаполненной.

  const cities = await prisma.city.findMany({
    where: { isActive: true },
    orderBy: [{ isCapital: 'desc' }, { name: 'asc' }],
    select: { slug: true, name: true, region: true, isCapital: true },
  })

  return { user, cities }
}
