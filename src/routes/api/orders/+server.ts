// src/routes/api/orders/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import type { RequestHandler } from './$types'

/**
 * GET /api/orders?role=client|master&status=ACTIVE|COMPLETED|CANCELLED
 *
 * Мои заказы (создаются только через accept proposal — POST нет).
 */
export const GET: RequestHandler = async ({ request, url }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const role = url.searchParams.get('role') ?? 'all'
  const statusFilter = url.searchParams.get('status') ?? 'all'
  const userId = session.user.id

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
    },
    take: 100,
  })

  return json({ orders })
}
