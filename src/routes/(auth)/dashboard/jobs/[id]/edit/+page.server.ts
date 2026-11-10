import { error, redirect } from '@sveltejs/kit'
import { prisma } from '$lib/server/prisma'
import { requireUser } from '$lib/server/guards'
import type { PageServerLoad } from './$types'

// Редагування заявки — лише власник і лише відкрита (правила запису — у
// $lib/server/job-edit). Чужа — 404: сторінка не підтверджує, що заявка є.
// Закрита — назад на заявку: там видно, чому змінити вже не можна.
export const load: PageServerLoad = async ({ params, locals }) => {
  const userId = requireUser(locals).id

  // Лічильник віддається назовні лише після перевірки власника нижче.
  const [job, proposals] = await Promise.all([
    prisma.job.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        clientId: true,
        status: true,
        metadata: true,
        description: true,
        attachments: true,
        attachmentsPublicIds: true,
        createdAt: true,
      },
    }),
    prisma.proposal.count({ where: { jobId: params.id, status: 'SENT' } }),
  ])

  if (!job || job.clientId !== userId) error(404, 'Заявку не знайдено')
  if (job.status !== 'OPEN') redirect(303, `/dashboard/jobs/${job.id}`)

  return {
    job: {
      id: job.id,
      metadata: (job.metadata ?? null) as Record<string, unknown> | null,
      description: job.description,
      attachments: job.attachments,
      attachmentsPublicIds: job.attachmentsPublicIds,
      createdAt: job.createdAt.toISOString(),
      proposals,
    },
  }
}
