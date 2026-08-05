// src/lib/server/guard.ts
//
// Серверні guard-и за роллю. Викликаються з load() сторінки ОДНИМ рядком —
// авторизація стає видимою в коді сторінки, її неможливо «забути непомітно»,
// як сталося з /dashboard/proposals (клієнт бачив порожню сторінку майстра).
//
// Роль читається з БД, а не із сесії: сесію клієнт теоретично впливає, БД — ні.
// Хешів/токенів не чіпаємо — тягнемо лише role.

import { redirect } from '@sveltejs/kit'
import type { Role } from '../../generated/prisma/client'
import { prisma } from './prisma'

export interface GuardedUser {
  id: string
  role: Role
}

/**
 * Гарантує залогіненого користувача з роллю з дозволеного списку.
 * Інакше — редірект: гість на логін, чужа роль на свій дашборд.
 *
 *   const user = await requireRole(locals, ['MASTER'], '/dashboard/proposals')
 */
export async function requireRole(
  locals: App.Locals,
  allowed: Role[],
  redirectTo: string,
): Promise<GuardedUser> {
  // Сесія вже резолвнута sessionHandle у hooks.server.ts.
  const sessionUser = locals.user
  if (!sessionUser) {
    redirect(302, `/user/login?redirectTo=${encodeURIComponent(redirectTo)}`)
  }

  // На /dashboard/** guardHandle уже прочитав роль з БД і поклав у
  // locals.account — беремо готове замість другого SELECT. Гарантія
  // «роль із БД, а не із сесії» зберігається: account заповнюється саме
  // з таблиці User.
  if (locals.account) {
    if (!allowed.includes(locals.account.role)) redirect(302, '/dashboard')
    return { id: locals.account.id, role: locals.account.role }
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, role: true },
  })
  if (!user) redirect(302, '/user/login')

  // Чужа роль → на власну головну, а не на логін: користувач залогінений,
  // просто не туди зайшов. Порожня сторінка чи 403 гірші за тихий редірект.
  if (!allowed.includes(user.role)) {
    redirect(302, '/dashboard')
  }

  return user
}
