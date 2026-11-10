import { json, error } from '@sveltejs/kit'
import { requireApiUser } from '$lib/server/guards'
import { prisma } from '$lib/server/prisma'
import type { RequestHandler } from './$types'

/**
 * GET /api/orders?role=client|master&status=ACTIVE|COMPLETED|CANCELLED
 *
 * Мои заказы (создаются только через accept proposal — POST нет).
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireApiUser(locals)

  const role = url.searchParams.get('role') ?? 'all'
  const statusFilter = url.searchParams.get('status') ?? 'all'
  const userId = user.id

  let statusList:
    | ('CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED')[]
    | undefined
  if (statusFilter === 'ACTIVE') {
    statusList = ['CREATED', 'IN_PROGRESS']
  } else if (statusFilter === 'COMPLETED') {
    statusList = ['COMPLETED']
  } else if (statusFilter === 'CANCELLED') {
    statusList = ['CANCELLED']
  }

  const where = {
    AND: [
      role === 'client'
        ? { clientId: userId }
        : role === 'master'
          ? { masterId: userId }
          : { OR: [{ clientId: userId }, { masterId: userId }] },
      statusList ? { status: { in: statusList } } : {},
    ],
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      // Картка (і в застосунку) бере з неї послугу, день і характеристики.
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
      // «today/tomorrow» у metadata відносні до дня створення ЗАЯВКИ, а не
      // замовлення — без цієї дати день прибирання зсувався б.
      fromJob: { select: { createdAt: true } },
    },
    take: 100,
  })

  // Поля лише додаються (metadata, jobCreatedAt) — старі версії
  // застосунку їх просто не читають.
  return json({
    orders: orders.map(({ fromJob, ...o }) => ({
      ...o,
      jobCreatedAt: fromJob?.createdAt.toISOString() ?? null,
    })),
  })
}
