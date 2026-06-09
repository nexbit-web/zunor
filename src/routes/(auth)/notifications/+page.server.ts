// src/routes/(auth)/notifications/+page.server.ts
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

const PAGE_SIZE = 20

export const load: PageServerLoad = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw redirect(302, '/user/login?redirectTo=/notifications')

  const userId = session.user.id

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
