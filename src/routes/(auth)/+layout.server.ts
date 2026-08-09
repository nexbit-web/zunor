// Виконується на кожній навігації всередині /dashboard. Тому тут лишилась
// рівно одна річ, яку не можна взяти з клієнта — роль користувача.
//
// Що звідси прибрано і куди поїхало:
//   • список чатів  → chatStore, один запит за сесію (/api/chats), далі Pusher
//   • лічильник сповіщень → стор сповіщень (/api/me/badges), далі Pusher
// Обидва раніше виконувались на КОЖЕН перехід між сторінками дашборда.

import { prisma } from '$lib/server/prisma'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ locals }) => {
  const session = locals.session
  if (!session?.user) {
    return { session: null, role: null }
  }

  // Роль беремо з БД, а не з session.user.role: сесія кешується в cookie
  // на 5 хвилин, тому одразу після апгрейду CLIENT → MASTER там ще стара
  // роль — і сайдбар показує вкладки замовника мастеру.
  // На /dashboard/** guardHandle уже зробив цей SELECT → беремо готове,
  // тобто у штатному випадку запиту до бази тут теж немає.
  const account =
    locals.account ??
    (await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    }))

  return {
    session,
    role: account?.role ?? null,
  }
}
