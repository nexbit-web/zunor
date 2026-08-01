// src/routes/(auth)/dashboard/onboarding/+page.server.ts
//
// Єдиний онбординг для обох ролей. load віддає дані ДЛЯ ОБОХ компонентів
// (роль ще не обрана), тож повертає і cities+prefill (клієнт), і
// categories+user.masterProfile (майстер).
//
// Клієнт зберігається через action `save` (тут). Майстер — через існуючий
// /api/user/onboarding (модерація PENDING, приймати замовлення може одразу).
// Обидва виставляють onboarded=true → замок у hooks пропускає.

import { prisma } from '$lib/prisma'
import { redirect, fail } from '@sveltejs/kit'
import type { PageServerLoad, Actions } from './$types'

const PHONE_RE = /^\+380\d{9}$/

export const load: PageServerLoad = async ({ locals }) => {
  const session = locals.session
  if (!session)
    throw redirect(303, '/user/login?redirectTo=/dashboard/onboarding')

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
      bio: true,
      role: true,
      onboarded: true,
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
  if (!user) throw redirect(303, '/user/login')

  // Уже пройшов онбординг — тут робити нічого.
  if (user.onboarded) throw redirect(303, '/dashboard')

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

  return {
    user,
    categories,
    cities,
    prefill: {
      name: user.name ?? '',
      phone: user.phone ?? '',
      citySlug: user.city ?? '',
      avatar: user.avatar ?? '',
      avatarPublicId: user.avatarPublicId ?? '',
    },
  }
}

export const actions: Actions = {
  // Клієнтський онбординг: важливі поля → onboarded=true → одразу замовляє.
  // (Майстер іде не сюди, а в /api/user/onboarding.)
  save: async ({ request, locals }) => {
    const session = locals.session
    if (!session) return fail(401, { error: 'Не авторизовано' })

    const form = await request.formData()
    const name = String(form.get('name') ?? '').trim()
    const phone = String(form.get('phone') ?? '').trim()
    const citySlug = String(form.get('city') ?? '').trim()
    const avatarRaw = String(form.get('avatar') ?? '').trim()
    const avatarPublicId = String(form.get('avatarPublicId') ?? '').trim()

    const errors: Record<string, string> = {}
    if (name.length < 2 || name.length > 50) errors.name = "Вкажіть ім'я"
    if (!PHONE_RE.test(phone)) errors.phone = 'Формат: +380XXXXXXXXX'

    const city = citySlug
      ? await prisma.city.findFirst({
          where: { slug: citySlug, isActive: true },
          select: { slug: true },
        })
      : null
    if (!city) errors.city = 'Оберіть місто зі списку'

    // Аватар — лише наш Cloudinary або гугл-фото.
    const avatar =
      avatarRaw &&
      (avatarRaw.startsWith('https://res.cloudinary.com/') ||
        avatarRaw.startsWith('https://lh3.googleusercontent.com/'))
        ? avatarRaw
        : null

    if (Object.keys(errors).length > 0) {
      return fail(400, { errors, values: { name, phone, citySlug } })
    }

    try {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          name,
          phone,
          city: city!.slug,
          role: 'CLIENT',
          onboarded: true,
          ...(avatar ? { avatar, avatarPublicId: avatarPublicId || null } : {}),
        },
      })
    } catch {
      return fail(500, { error: 'Не вдалося зберегти. Спробуйте ще раз.' })
    }

    throw redirect(303, '/dashboard')
  },
}
