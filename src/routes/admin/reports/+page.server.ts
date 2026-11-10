import { requireStaff } from '$lib/server/admin/guard'
import { prisma } from '$lib/server/prisma'
import type { PageServerLoad } from './$types'

const STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const
type Status = (typeof STATUSES)[number]

// Черга скарг: відкриті — від найстарішої.
export const load: PageServerLoad = async ({ locals, url }) => {
  await requireStaff(locals)

  const raw = url.searchParams.get('status')
  const status: Status = STATUSES.includes(raw as Status) ? (raw as Status) : 'OPEN'

  const reports = await prisma.report.findMany({
    where: { status },
    orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
    take: 100,
    select: {
      id: true,
      reason: true,
      text: true,
      orderId: true,
      chatId: true,
      jobId: true,
      createdAt: true,
      reporter: { select: { name: true } },
      target: { select: { id: true, name: true, role: true } },
    },
  })

  return {
    status,
    items: reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      text: r.text,
      context: r.orderId ? 'замовлення' : r.chatId ? 'чат' : r.jobId ? 'заявка' : 'профіль',
      createdAt: r.createdAt.toISOString(),
      reporter: r.reporter.name,
      target: r.target.name,
      targetRole: r.target.role,
    })),
  }
}
