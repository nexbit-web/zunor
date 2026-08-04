// Порядок middleware критичний:
//   1. securityHeaders — CSP/HSTS на ВСІ відповіді (обгортає ланцюжок)
//   2. authHandle      — better-auth обробляє /api/auth/*
//   3. sessionHandle   — резолвить сесію ОДИН раз → locals.session/user
//   4. guardHandle     — banned → emailVerified → onboarded → маршрут
//
// Єдине джерело правди про сесію на запит — locals.

import { auth } from '$lib/server/auth'
import { prisma } from '$lib/server/prisma'
import { svelteKitHandler } from 'better-auth/svelte-kit'
import { building, dev } from '$app/environment'
import { sequence } from '@sveltejs/kit/hooks'
import { redirect, type Handle } from '@sveltejs/kit'
import { touchPresence } from '$lib/server/presence'
import { getAccountState, invalidateAccount } from '$lib/server/account-cache'
// ═══════════════════ Маршрути ═══════════════════

const LOGIN_PATH = '/user/login'
const VERIFY_PATH = '/user/verify-email'
const ONBOARDING_PATH = '/dashboard/onboarding'
const HOME_PATH = '/dashboard'
const PROTECTED_PREFIX = '/dashboard'

/** Залогіненому тут нема чого робити — на дашборд. */
const GUEST_ONLY = new Set([LOGIN_PATH, '/user/register'])
// /user/forgot і /user/reset-password навмисно НЕ guest-only:
// юзер може бути залогінений і скидати пароль за листом.

// ═══════════════════ Better-auth handler ═══════════════════

const authHandle: Handle = async ({ event, resolve }) =>
  svelteKitHandler({ event, resolve, auth, building })

// ═══════════════════ Сесія → locals ═══════════════════

const sessionHandle: Handle = async ({ event, resolve }) => {
  // route.id === null → запит не зматчився з роутом (404, статика в dev).
  if (event.route.id === null) {
    event.locals.session = null
    event.locals.user = null
    event.locals.account = null
    return resolve(event)
  }

  const session = await auth.api
    .getSession({ headers: event.request.headers })
    .catch(() => null) // збій auth-шару = аноним, а не 500 на весь сайт

  event.locals.session = session
  event.locals.user = session?.user ?? null
  event.locals.account = null

  if (session) touchPresence(session.user.id)

  return resolve(event)
}

// ═══════════════════ Замки ═══════════════════

const guardHandle: Handle = async ({ event, resolve }) => {
  const { pathname, search } = event.url
  const session = event.locals.session

  // API захищає себе сам: fetch-клієнту потрібен 401, а не 302 на HTML.
  if (pathname.startsWith('/api/')) return resolve(event)

  const isProtected = pathname.startsWith(PROTECTED_PREFIX)

  // ─── Гість ───
  if (!session) {
    if (isProtected) {
      redirect(
        303,
        `${LOGIN_PATH}?redirectTo=${encodeURIComponent(pathname + search)}`,
      )
    }
    return resolve(event)
  }

  // ─── Залогінений ───
  // Стан читаємо з БД, а не із сесії: cookieCache живе 5 хв, і за цей час
  // бан або підтвердження пошти не встигли б подіяти.
  const needsAccountState =
    isProtected ||
    pathname === VERIFY_PATH ||
    pathname === '/' ||
    GUEST_ONLY.has(pathname)

  if (!needsAccountState) return resolve(event)

  // Кешується на 30 секунд: ці поля майже не змінюються, а запит інакше
  // йде на кожну навігацію дашборда. Зміни через застосунок скидають
  // кеш явно (invalidateAccount), тож бан і онбординг діють миттєво.
  const account = await getAccountState(session.user.id)

  // Сесія є, юзера в БД нема (видалений) — сесія недійсна.
  if (!account) redirect(303, LOGIN_PATH)

  // ─── Замок 1: бан ───
  // Убиваємо сесії в БД, щоб доступ зник і після протухання cookie-кешу.
  if (account.banned) {
    await prisma.session
      .deleteMany({ where: { userId: account.id } })
      .catch(() => {})
    invalidateAccount(account.id)
    redirect(303, `${LOGIN_PATH}?error=banned`)
  }

  // ─── Замок 2: підтвердження пошти ───
  // Google-юзери сюди не потрапляють: провайдер віддає email_verified,
  // better-auth проставляє emailVerified при першому вході.
  if (!account.emailVerified) {
    if (pathname === VERIFY_PATH) return resolve(event)
    redirect(303, VERIFY_PATH)
  }

  // Пошта вже підтверджена — на сторінці верифікації робити нічого.
  if (pathname === VERIFY_PATH) redirect(303, HOME_PATH)

  // ─── Guest-only і лендінг ───
  // Точна перевірка pathname === '/': /privacy, /terms, /@username
  // лишаються доступними залогіненому.
  if (pathname === '/' || GUEST_ONLY.has(pathname)) redirect(303, HOME_PATH)

  if (!isProtected) return resolve(event)

  // ─── Замок 3: онбординг ───
  // Не пройшов онбординг → замикаємо в /dashboard/onboarding/**.
  if (!account.onboarded && !pathname.startsWith(ONBOARDING_PATH)) {
    redirect(303, ONBOARDING_PATH)
  }

  // Пройшов онбординг → екран вибору ролі закритий назавжди.
  // Точне порівняння, а не startsWith: дочірній /onboarding/master
  // лишається доступним онбордженому КЛІЄНТУ — це апгрейд ролі,
  // і його власний load сам розвертає мастера на /dashboard/profile.
  if (account.onboarded && pathname === ONBOARDING_PATH) {
    redirect(303, '/dashboard/profile')
  }

  // Віддаємо стан далі — load-функції не роблять той самий SELECT удруге.
  event.locals.account = {
    id: account.id,
    role: account.role,
    onboarded: account.onboarded,
    emailVerified: account.emailVerified,
  }

  return resolve(event)
}

// ═══════════════════ Security headers ═══════════════════

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event)

  // Після logout браузер не має права дістати сторінку з дискового кешу.
  if (event.url.pathname.startsWith('/dashboard')) {
    response.headers.set('Cache-Control', 'no-store, must-revalidate')
  }

  if (dev) {
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    return response
  }

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' https://js.pusher.com`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com`,
    `media-src 'self' blob: https://res.cloudinary.com`,
    `font-src 'self' data:`,
    `connect-src 'self' https://api.cloudinary.com https://*.pusher.com wss://*.pusher.com https://sockjs-eu.pusher.com`,
    // Google OAuth редіректить top-level, не в iframe — 'none' коректно.
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    // 'self' достатньо: better-auth сам робить POST на /api/auth/*,
    // редірект на accounts.google.com іде через 302, не через form.
    `form-action 'self'`,
  ].join('; ')

  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains',
  )
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  )
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin')

  return response
}

export const handle = sequence(
  securityHeaders,
  authHandle,
  sessionHandle,
  guardHandle,
)
