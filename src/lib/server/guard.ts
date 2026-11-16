// * гард за роллю — одним рядком на початку load(). Роль читається з бази,
// * а не із сесії

import { redirect } from '@sveltejs/kit'
import type { Role } from '../../generated/prisma/client'
import { prisma } from './prisma'

export interface GuardedUser {
  id: string
  role: Role
}

/** Залогінений із дозволеною роллю; інакше редірект: гість — на логін, чужа роль — на дашборд. */
export async function requireRole(
  locals: App.Locals,
  allowed: Role[],
  redirectTo: string,
): Promise<GuardedUser> {
  const sessionUser = locals.user
  if (!sessionUser) {
    redirect(302, `/user/login?redirectTo=${encodeURIComponent(redirectTo)}`)
  }

  // * на /dashboard/** роль уже прочитав guardHandle — другого SELECT немає
  if (locals.account) {
    if (!allowed.includes(locals.account.role)) redirect(302, '/dashboard')
    return { id: locals.account.id, role: locals.account.role }
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, role: true },
  })
  if (!user) redirect(302, '/user/login')

  // * чужа роль — на свою головну, а не на логін: людина залогінена
  if (!allowed.includes(user.role)) {
    redirect(302, '/dashboard')
  }

  return user
}
