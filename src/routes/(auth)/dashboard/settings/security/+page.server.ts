import { prisma } from '$lib/server/prisma'
import { requireUser } from '$lib/server/guards'
import { activeOrdersCount } from '$lib/server/active-orders'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const user = requireUser(locals, '/dashboard/settings/security')

  // Які способи входу прив'язані. Хеші лишаються на сервері —
  // назовні йдуть лише providerId. Активні замовлення — щоб кнопка
  // «Видалити акаунт» одразу сказала, чому зараз не можна, а не після
  // введення пошти.
  const [accounts, activeOrders] = await Promise.all([
    prisma.account.findMany({
      where: { userId: user.id },
      select: { providerId: true },
    }),
    activeOrdersCount(user.id),
  ])

  const providers = accounts.map((a) => a.providerId)

  return {
    // 'credential' — вхід поштою й паролем.
    hasPassword: providers.includes('credential'),
    hasGoogle: providers.includes('google'),
    email: user.email,
    activeOrders,
  }
}
