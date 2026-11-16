// * виконується на кожній навігації дашборда, тому віддає лише роль. Список
// * чатів і лічильник сповіщень живуть у сторах: запит за сесію, далі Pusher

import { prisma } from '$lib/server/prisma'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ locals }) => {
  const session = locals.session
  if (!session?.user) {
    return { session: null, role: null }
  }

  // * роль — з бази, а не з сесії: cookie-кеш на 5 хв памʼятає стару. На
  // * /dashboard/** її вже прочитав guardHandle — запиту тут немає
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
