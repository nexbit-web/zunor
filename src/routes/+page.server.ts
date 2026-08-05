// src/routes/+page.server.ts
import { prisma } from '$lib/server/prisma'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  // На практиці сюди залогінений не доходить: guardHandle у hooks.server.ts
  // розвертає '/' на /dashboard ще до load. Гілка нижче лишається
  // страховкою на випадок зміни правил у хуці.
  const session = locals.session

  // Неавторизований або клієнт — бачить клієнтську головну
  if (!session) return {}

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  })

  // Майстер працює зі стрічкою заявок — це його дім, не клієнтський лендинг
  if (user?.role === 'MASTER') {
    redirect(302, '/dashboard/jobs')
  }

  return {}
}
