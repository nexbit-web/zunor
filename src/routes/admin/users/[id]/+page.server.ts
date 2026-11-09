import { error } from '@sveltejs/kit'
import { prisma } from '$lib/server/prisma'
import { requireStaff } from '$lib/server/admin/guard'
import { banUser, unbanUser } from '$lib/server/admin/actions'
import { asForm, field } from '$lib/server/admin/form'
import { activeOrdersCount } from '$lib/server/active-orders'
import type { Actions, PageServerLoad } from './$types'

// Сторінка людини. Дивитись може й модератор (на неї ведуть скарги),
// банити — менеджер і вище (перевіряє banUser).
export const load: PageServerLoad = async ({ locals, params }) => {
  await requireStaff(locals)

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      phone: true,
      avatar: true,
      role: true,
      city: true,
      createdAt: true,
      lastSeen: true,
      banned: true,
      banReason: true,
      emailVerified: true,
      onboarded: true,
      avgRatingAsMaster: true,
      reviewsCountAsMaster: true,
      avgRatingAsClient: true,
      reviewsCountAsClient: true,
      telegramChatId: true,
      masterProfile: { select: { verificationStatus: true } },
    },
  })
  if (!user) error(404, 'Користувача не знайдено')

  const [jobs, ordersAsClient, ordersAsMaster, activeOrders, reportsReceived, reportsFiled, recentReports] =
    await Promise.all([
      prisma.job.count({ where: { clientId: user.id } }),
      prisma.order.count({ where: { clientId: user.id } }),
      prisma.order.count({ where: { masterId: user.id } }),
      activeOrdersCount(user.id),
      prisma.report.count({ where: { targetId: user.id } }),
      prisma.report.count({ where: { reporterId: user.id } }),
      prisma.report.findMany({
        where: { targetId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, reason: true, status: true, createdAt: true },
      }),
    ])

  return {
    user: {
      ...user,
      // Сам id чату не потрібен — лише чи підключено.
      telegramChatId: undefined,
      telegram: !!user.telegramChatId,
      verification: user.masterProfile?.verificationStatus ?? null,
      masterProfile: undefined,
      deleted: user.banReason === 'account-deleted',
      createdAt: user.createdAt.toISOString(),
      lastSeen: user.lastSeen.toISOString(),
    },
    stats: { jobs, ordersAsClient, ordersAsMaster, activeOrders, reportsReceived, reportsFiled },
    recentReports: recentReports.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  }
}

export const actions: Actions = {
  ban: async (event) =>
    asForm(async () => {
      const staff = await requireStaff(event.locals, 'MANAGER')
      const reason = field(await event.request.formData(), 'reason')
      await banUser(event, staff, event.params.id, reason)
      return { ok: 'Заблоковано' }
    }),

  unban: async (event) =>
    asForm(async () => {
      const staff = await requireStaff(event.locals, 'MANAGER')
      await unbanUser(event, staff, event.params.id)
      return { ok: 'Розблоковано' }
    }),
}
