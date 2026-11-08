import { prisma } from '$lib/server/prisma'
import { requireUser } from '$lib/server/guards'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
  const userId = requireUser(locals).id

  // Роль уже прочитана з БД у guardHandle і лежить у locals.account —
  // окремий SELECT тут був другим запитом за ту саму колонку на кожен
  // вхід на сторінку. Фолбек на CLIENT лишається на випадок, якщо роут
  // колись винесуть з-під /dashboard, де account не заповнюється.
  const userRole = locals.account?.role ?? 'CLIENT'
  const roleParam = url.searchParams.get('role')
  const role: 'all' | 'client' | 'master' =
    roleParam === 'client' || roleParam === 'master' ? roleParam : 'all'

  const where = {
    AND: [
      role === 'client'
        ? { clientId: userId }
        : role === 'master'
          ? { masterId: userId }
          : { OR: [{ clientId: userId }, { masterId: userId }] },
    ],
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      // Картка бере з неї послугу, день і теги характеристик.
      metadata: true,
      priceCents: true,
      currency: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      startedAt: true,
      completedAt: true,
      clientId: true,
      masterId: true,
      client: {
        select: { id: true, name: true, username: true, avatar: true },
      },
      master: {
        select: { id: true, name: true, username: true, avatar: true },
      },
      // «today/tomorrow» у metadata відносні до дня створення ЗАЯВКИ, а
      // не замовлення — без цієї дати день прибирання зсувався б.
      fromJob: { select: { createdAt: true } },
    },
    take: 200,
  })

  const counts = {
    active: orders.filter((o) => ['CREATED', 'IN_PROGRESS'].includes(o.status))
      .length,
    completed: orders.filter((o) => o.status === 'COMPLETED').length,
    cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
  }

  return {
    orders: orders.map(({ fromJob, ...o }) => ({
      ...o,
      jobCreatedAt: fromJob?.createdAt.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      startedAt: o.startedAt?.toISOString() ?? null,
      completedAt: o.completedAt?.toISOString() ?? null,
    })),
    counts,
    viewerId: userId,
    roleFilter: role,
    userRole: userRole as 'CLIENT' | 'MASTER' | 'ADMIN',
  }
}
