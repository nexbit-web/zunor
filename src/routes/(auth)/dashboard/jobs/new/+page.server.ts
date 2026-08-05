import { prisma } from '$lib/server/prisma'
import { requireRole } from '$lib/server/guard'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  // Створення заявки — тільки клієнт. Майстра редіректимо на дашборд.
  const user = await requireRole(locals, ['CLIENT'], '/dashboard/jobs/new')

  // Місто для префілу форми — окремий запит, бо guard тягне лише id+role.
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { city: true },
  })

  return {
    userCity: profile?.city ?? null,
  }
}
