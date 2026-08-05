// src/routes/+layout.server.ts
//
// Кореневий лейаут виконується на КОЖНІЙ навігації — включно з публічними
// сторінками і з усім /dashboard. Тому тут лишається тільки те, що потрібно
// публічній частині: сесія + лічильник сповіщень для дзвіночка в хедері.
//
// Список чатів і повний набір бейджів вантажить (auth)/+layout.server.ts.
// Раніше те саме робилось і тут: на кожному переході дашборда обидва лейаути
// тягнули чати, а дані кореневого все одно перекривались дочірніми — тобто
// половина запитів була роботою в кошик.

import { prisma } from '$lib/server/prisma'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ locals, depends }) => {
  depends('app:badges')

  // Сесію вже резолвнув sessionHandle у hooks.server.ts — другий
  // auth.api.getSession() на той самий запит нічого не додає.
  const session = locals.session

  if (!session?.user) {
    return { session: null, badges: null }
  }

  const notifications = await prisma.notification.count({
    where: { userId: session.user.id, isRead: false },
  })

  return {
    session,
    badges: {
      notifications,
      // Непрочитані повідомлення показує лише дашборд (сайдбар і bottom-nav),
      // а там значення приходить з (auth)-лейауту, порахованим зі списку
      // чатів без окремого запиту. Публічним сторінкам цей лічильник не
      // потрібен — рахувати його тут означало б корельований підзапит на
      // кожну навігацію заради невидимого числа.
      messages: 0,
    },
  }
}
