import { prisma } from '$lib/server/prisma'
import { requireRole } from '$lib/server/guard'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ request }) => {
  // Пропозиції — сторінка МАЙСТРА. Клієнта сюди не пускаємо (раніше він
  // проходив перевірку й бачив порожній список — тепер редірект на дашборд).
  const user = await requireRole(request, ['MASTER'], '/dashboard/proposals')

  const proposals = await prisma.proposal.findMany({
    where: { masterId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          budgetMinCents: true,
          budgetMaxCents: true,
          currency: true,
          client: {
            select: {
              id: true,
              name: true,
              avatar: true,
              username: true,
            },
          },
        },
      },
    },
  })

  const counts = {
    sent: proposals.filter((p) => p.status === 'SENT').length,
    accepted: proposals.filter((p) => p.status === 'ACCEPTED').length,
    rejected: proposals.filter((p) => p.status === 'REJECTED').length,
    withdrawn: proposals.filter((p) => p.status === 'WITHDRAWN').length,
  }

  return {
    proposals: proposals.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      withdrawnAt: p.withdrawnAt?.toISOString() ?? null,
    })),
    counts,
  }
}
