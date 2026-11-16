import { error, redirect } from '@sveltejs/kit'
import { loadClientProfile } from '$lib/server/client-profile'
import type { PageServerLoad } from './$types'

// * хто й що бачить — $lib/server/client-profile (той самий код, що в
// * GET /api/clients/[id] для застосунку)
export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
  // * навмисно 404, а не редірект на логін: гість не має дізнатись навіть
  // * те, що такий профіль існує. Тому тут не requireUser
  const viewerUser = locals.user
  if (!viewerUser) throw error(404, 'Користувача не знайдено')

  // * свій профіль → на дашборд
  if (params.id === viewerUser.id) throw redirect(302, '/dashboard')

  // * дивитися профіль клієнта може лише майстер; телефону немає
  const user = await loadClientProfile(viewerUser.id, params.id)
  if (!user) throw error(404, 'Користувача не знайдено')

  setHeaders({
    'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex, nofollow',
  })

  return {
    user,
    isOwner: false as const,
    isAuthenticated: true as const,
  }
}
