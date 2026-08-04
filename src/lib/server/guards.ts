import { error, redirect } from '@sveltejs/kit'
import type { User, Session } from './auth'

/** Для сторінок: гість → редірект на логін. Повертає гарантованого юзера. */
export function requireUser(locals: App.Locals, redirectTo?: string): User {
  if (!locals.user) {
    const target = redirectTo
      ? `/user/login?redirectTo=${encodeURIComponent(redirectTo)}`
      : '/user/login'
    redirect(303, target)
  }
  return locals.user
}

/** Для API: гість → 401. Fetch-клієнту потрібен статус, не 302 на HTML. */
export function requireApiUser(locals: App.Locals): User {
  if (!locals.user) error(401, 'Unauthorized')
  return locals.user
}

/** Повна сесія, якщо потрібні token/expiresAt, не лише user. */
export function requireApiSession(locals: App.Locals): Session {
  if (!locals.session) error(401, 'Unauthorized')
  return locals.session
}
