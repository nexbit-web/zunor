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

/**
 * Скільки після входу сесія вважається «щойно увійшов». Для дій, які
 * чужа сесія не має права робити взагалі: видалити акаунт, привʼязати
 * другий фактор адмінки. Сесія живе 30 днів, і вкрадена cookie чи не
 * закритий чужий компʼютер — це ще не людина, що знає пароль.
 */
export const FRESH_SESSION_MS = 15 * 60_000

/** Людина увійшла (паролем чи через Google) не раніше FRESH_SESSION_MS тому. */
export function isFreshSession(locals: App.Locals, now = Date.now()): boolean {
  const createdAt = locals.session?.session?.createdAt
  const at = createdAt ? new Date(createdAt).getTime() : NaN
  return Number.isFinite(at) && now - at <= FRESH_SESSION_MS
}
