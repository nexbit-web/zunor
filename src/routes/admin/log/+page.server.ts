import { prisma } from '$lib/server/prisma'
import { requireStaff } from '$lib/server/admin/guard'
import type { PageServerLoad } from './$types'

const PAGE = 100

// Журнал дій — лише для ADMIN. Лише читання: змінити чи стерти запис з
// адмінки неможливо. Сторінки — курсором за датою (?before=ISO).
export const load: PageServerLoad = async ({ locals, url }) => {
  await requireStaff(locals, 'ADMIN')

  const beforeRaw = url.searchParams.get('before')
  const before = beforeRaw ? new Date(beforeRaw) : null

  const rows = await prisma.adminAction.findMany({
    where: before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {},
    orderBy: { createdAt: 'desc' },
    take: PAGE + 1,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      details: true,
      ip: true,
      createdAt: true,
      actor: { select: { name: true, email: true } },
    },
  })

  const items = rows.slice(0, PAGE)
  return {
    items: items.map((r) => ({
      ...r,
      details: r.details ? JSON.stringify(r.details) : null,
      createdAt: r.createdAt.toISOString(),
    })),
    next: rows.length > PAGE ? items[items.length - 1].createdAt.toISOString() : null,
  }
}
