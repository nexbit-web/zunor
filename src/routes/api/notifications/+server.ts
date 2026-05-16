// src/routes/api/notifications/+server.ts
import { json, error } from '@sveltejs/kit'
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import type { RequestHandler } from './$types'

/**
 * GET /api/notifications?cursor=<id>&limit=20&unreadOnly=true
 * Повертає мої повідомлення.
 */
export const GET: RequestHandler = async ({ request, url }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const cursor = url.searchParams.get('cursor')
  const limit = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get('limit') ?? 20)),
  )
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true'

  const items = await prisma.notification.findMany({
    where: {
      userId: session.user.id,
      ...(unreadOnly ? { isRead: false } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      orderId: true,
      proposalId: true,
      jobId: true,
      chatId: true,
      isRead: true,
      createdAt: true,
    },
  })

  const hasMore = items.length > limit
  const list = hasMore ? items.slice(0, limit) : items
  const nextCursor = hasMore ? list[list.length - 1].id : null

  // Лічильник непрочитаних
  const unreadCount = await prisma.notification.count({
    where: { userId: session.user.id, isRead: false },
  })

  return json({
    items: list.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    nextCursor,
    unreadCount,
  })
}

/**
 * POST /api/notifications
 * Body: { ids?: string[], action: 'mark-read' | 'mark-all-read' | 'delete' }
 */
export const POST: RequestHandler = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw error(401, 'Unauthorized')

  const body = await request.json().catch(() => null)
  if (!body) throw error(400, 'Invalid JSON')

  const action = String(body.action ?? '')
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : []

  if (action === 'mark-all-read') {
    const result = await prisma.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })
    return json({ ok: true, affected: result.count })
  }

  if (action === 'mark-read' && ids.length > 0) {
    const result = await prisma.notification.updateMany({
      where: { userId: session.user.id, id: { in: ids }, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })
    return json({ ok: true, affected: result.count })
  }

  if (action === 'delete' && ids.length > 0) {
    const result = await prisma.notification.deleteMany({
      where: { userId: session.user.id, id: { in: ids } },
    })
    return json({ ok: true, affected: result.count })
  }

  throw error(400, 'Unknown action')
}
