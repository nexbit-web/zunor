import { requireStaff } from '$lib/server/admin/guard'
import { prisma } from '$lib/server/prisma'
import type { PageServerLoad } from './$types'

const STATUSES = ['PENDING', 'REJECTED', 'VERIFIED'] as const
type Status = (typeof STATUSES)[number]

// Черга анкет майстрів. За замовчуванням — ті, що чекають, від
// найстарішої: хто подав раніше, той і чекає довше.
export const load: PageServerLoad = async ({ locals, url }) => {
  await requireStaff(locals)

  const raw = url.searchParams.get('status')
  const status: Status = STATUSES.includes(raw as Status) ? (raw as Status) : 'PENDING'

  const profiles = await prisma.masterProfile.findMany({
    where: { verificationStatus: status, user: { banned: false } },
    orderBy: { updatedAt: status === 'PENDING' ? 'asc' : 'desc' },
    take: 100,
    select: {
      updatedAt: true,
      categories: true,
      crew: true,
      portfolioImages: true,
      user: {
        select: { id: true, name: true, email: true, avatar: true, city: true },
      },
    },
  })

  return {
    status,
    items: profiles.map((p) => ({
      id: p.user.id,
      name: p.user.name,
      email: p.user.email,
      avatar: p.user.avatar,
      city: p.user.city,
      crew: p.crew,
      photos: p.portfolioImages.length,
      submittedAt: p.updatedAt.toISOString(),
    })),
  }
}
