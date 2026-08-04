import { prisma } from '$lib/server/prisma'
import { requireUser } from '$lib/server/guards'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const user = requireUser(locals, '/dashboard/settings/security')

  // Які способи входу прив'язані. Хеші лишаються на сервері —
  // назовні йдуть лише providerId.
  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    select: { providerId: true },
  })

  const providers = accounts.map((a) => a.providerId)

  return {
    // 'credential' — вхід поштою й паролем.
    hasPassword: providers.includes('credential'),
    hasGoogle: providers.includes('google'),
    email: user.email,
  }
}
