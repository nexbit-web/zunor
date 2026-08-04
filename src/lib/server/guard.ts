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
import { auth } from './auth'
import { prisma } from './prisma'

export interface GuardedUser {
  id: string
  role: Role
}

/**
 * Гарантує залогіненого користувача з роллю з дозволеного списку.
 * Інакше — редірект: гість на логін, чужа роль на свій дашборд.
 *
 *   const user = await requireRole(request, ['MASTER'], '/dashboard/proposals')
 */
export async function requireRole(
  request: Request,
  allowed: Role[],
  redirectTo: string,
): Promise<GuardedUser> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) {
    throw redirect(
      302,
      `/user/login?redirectTo=${encodeURIComponent(redirectTo)}`,
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  })
  if (!user) throw redirect(302, '/user/login')

  // Чужа роль → на власну головну, а не на логін: користувач залогінений,
  // просто не туди зайшов. Порожня сторінка чи 403 гірші за тихий редірект.
  if (!allowed.includes(user.role)) {
    throw redirect(302, '/dashboard')
  }

  return user
}
