import { getAccountState } from '$lib/server/account-cache'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  // * на практиці сюди залогінений не доходить: guardHandle у hooks.server.ts
  // * розвертає '/' на /dashboard ще до load. Гілка нижче лишається
  // * страховкою на випадок зміни правил у хуці
  const session = locals.session

  // * неавторизований або клієнт — бачить клієнтську головну
  if (!session) return {}

  // * роль — із кешу стану акаунта, а не окремим SELECT
  const user = await getAccountState(session.user.id)

  // * майстер працює зі стрічкою заявок — це його дім, не клієнтський лендинг
  if (user?.role === 'MASTER') {
    redirect(302, '/dashboard/jobs')
  }

  return {}
}
