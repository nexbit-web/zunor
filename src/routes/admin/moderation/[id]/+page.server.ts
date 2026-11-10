import { error, redirect } from '@sveltejs/kit'
import { prisma } from '$lib/server/prisma'
import { getCategories, getDistricts } from '$lib/server/reference'
import { requireStaff } from '$lib/server/admin/guard'
import { decideVerification } from '$lib/server/admin/actions'
import { asForm, field } from '$lib/server/admin/form'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, params }) => {
  await requireStaff(locals)

  const user = await prisma.user.findFirst({
    where: { id: params.id, masterProfile: { isNot: null } },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      avatar: true,
      bio: true,
      city: true,
      district: true,
      createdAt: true,
      banned: true,
      avgRatingAsMaster: true,
      reviewsCountAsMaster: true,
      masterProfile: {
        select: {
          description: true,
          categories: true,
          portfolioImages: true,
          verificationStatus: true,
          verificationRejectReason: true,
          verifiedAt: true,
          crew: true,
          hasVehicle: true,
          travelRadiusKm: true,
          completedOrders: true,
          updatedAt: true,
        },
      },
    },
  })
  if (!user?.masterProfile) error(404, 'Анкету не знайдено')

  const [categories, districts, reportsCount] = await Promise.all([
    getCategories(),
    getDistricts(),
    prisma.report.count({ where: { targetId: user.id } }),
  ])
  const mp = user.masterProfile

  return {
    master: {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
      bio: user.bio,
      city: user.city,
      district:
        districts.find((d) => d.citySlug === user.city && d.slug === user.district)
          ?.name ?? user.district,
      createdAt: user.createdAt.toISOString(),
      banned: user.banned,
      rating: user.avgRatingAsMaster,
      reviews: user.reviewsCountAsMaster,
      reportsCount,
      description: mp.description,
      categories: mp.categories.map(
        (slug) => categories.find((c) => c.slug === slug)?.name ?? slug,
      ),
      portfolio: mp.portfolioImages,
      status: mp.verificationStatus,
      rejectReason: mp.verificationRejectReason,
      verifiedAt: mp.verifiedAt?.toISOString() ?? null,
      crew: mp.crew,
      hasVehicle: mp.hasVehicle,
      travelRadiusKm: mp.travelRadiusKm,
      completedOrders: mp.completedOrders,
      submittedAt: mp.updatedAt.toISOString(),
    },
  }
}

export const actions: Actions = {
  approve: async (event) =>
    asForm(async () => {
      const staff = await requireStaff(event.locals)
      await decideVerification(event, staff, event.params.id, 'approve')
      redirect(303, '/admin/moderation')
    }),

  reject: async (event) =>
    asForm(async () => {
      const staff = await requireStaff(event.locals)
      const reason = field(await event.request.formData(), 'reason')
      await decideVerification(event, staff, event.params.id, 'reject', reason)
      redirect(303, '/admin/moderation')
    }),
}
