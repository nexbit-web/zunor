// src/routes/(auth)/notifications/+page.server.ts
import { prisma } from '$lib/server/prisma'
import { requireUser } from '$lib/server/guards'
import type { PageServerLoad } from './$types'

const PAGE_SIZE = 20

export const load: PageServerLoad = async ({ locals }) => {
  const userId = requireUser(locals).id

  // Перша сторінка + лічильник непрочитаних — паралельно.
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
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
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ])

  const hasMore = rows.length > PAGE_SIZE
  const list = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  const nextCursor = hasMore ? list[list.length - 1].id : null

  return {
    userId,
    notifications: list.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    })),
    nextCursor,
    unreadCount,
  }
}
