// src/routes/+page.server.ts
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ request }) => {
  const session = await auth.api
    .getSession({ headers: request.headers })
    .catch(() => null)

  // Неавторизований або клієнт — бачить клієнтську головну
  if (!session) return {}

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  })

  // Майстер працює зі стрічкою заявок — це його дім, не клієнтський лендинг
  if (user?.role === 'MASTER') {
    throw redirect(302, '/jobs')
  }

  return {}
}
