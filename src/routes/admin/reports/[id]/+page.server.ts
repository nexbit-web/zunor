import { error, redirect } from '@sveltejs/kit'
import { prisma } from '$lib/server/prisma'
import { requireStaff } from '$lib/server/admin/guard'
import { resolveReport } from '$lib/server/admin/actions'
import { logAdmin } from '$lib/server/admin/audit'
import { asForm, field } from '$lib/server/admin/form'
import type { Actions, PageServerLoad } from './$types'

const PERSON = {
  id: true,
  name: true,
  email: true,
  role: true,
  banned: true,
  avgRatingAsMaster: true,
  avgRatingAsClient: true,
} as const

export const load: PageServerLoad = async (event) => {
  const staff = await requireStaff(event.locals)

  const report = await prisma.report.findUnique({
    where: { id: event.params.id },
    include: { reporter: { select: PERSON }, target: { select: PERSON } },
  })
  if (!report) error(404, 'Скаргу не знайдено')

  // Скільки ще скарг на ту саму людину — одна скарга й десята читаються
  // по-різному.
  const [targetReports, order, job, messages] = await Promise.all([
    prisma.report.count({ where: { targetId: report.targetId } }),
    report.orderId
      ? prisma.order.findUnique({
          where: { id: report.orderId },
          select: {
            title: true,
            status: true,
            priceCents: true,
            currency: true,
            createdAt: true,
            cancelReason: true,
          },
        })
      : null,
    report.jobId
      ? prisma.job.findUnique({
          where: { id: report.jobId },
          select: { title: true, description: true, status: true, createdAt: true },
        })
      : null,
    // Листування — лише в межах скарги на чат і лише останні 30
    // повідомлень: модераторові треба побачити, що сталось, а не читати
    // чужі розмови. Кожен такий перегляд записується в журнал нижче.
    report.chatId
      ? prisma.message.findMany({
          where: { chatId: report.chatId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: { id: true, text: true, senderId: true, createdAt: true, type: true },
        })
      : [],
  ])

  if (report.chatId) {
    await logAdmin(event, staff.id, 'report.view_chat', { type: 'report', id: report.id }, {
      chatId: report.chatId,
    })
  }

  return {
    report: {
      id: report.id,
      reason: report.reason,
      text: report.text,
      status: report.status,
      resolution: report.resolution,
      createdAt: report.createdAt.toISOString(),
      resolvedAt: report.resolvedAt?.toISOString() ?? null,
      reporter: report.reporter,
      target: report.target,
    },
    targetReports,
    order: order && { ...order, createdAt: order.createdAt.toISOString() },
    job: job && { ...job, createdAt: job.createdAt.toISOString() },
    messages: messages
      .reverse()
      .map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
  }
}

export const actions: Actions = {
  resolve: async (event) =>
    asForm(async () => {
      const staff = await requireStaff(event.locals)
      const note = field(await event.request.formData(), 'resolution')
      await resolveReport(event, staff, event.params.id, 'RESOLVED', note)
      redirect(303, '/admin/reports')
    }),

  dismiss: async (event) =>
    asForm(async () => {
      const staff = await requireStaff(event.locals)
      const note = field(await event.request.formData(), 'resolution')
      await resolveReport(event, staff, event.params.id, 'DISMISSED', note)
      redirect(303, '/admin/reports')
    }),
}
