// src/hooks.server.ts
//
// Порядок middleware критичний:
//   1. securityHeaders — CSP/HSTS на ВСІ відповіді (обгортає ланцюжок)
//   2. authHandle       — better-auth обробляє /api/auth/* (login, logout, reset…)
//   3. sessionHandle    — резолвить сесію ОДИН раз → event.locals.session/user
//   4. guardHandle      — /dashboard тільки з сесією; onboarding; guest-only
//
// Єдине джерело правди про сесію на запит — locals. Роути/loads НЕ повинні
// самі викликати auth.api.getSession (зайвий roundtrip + ризик розсинхрону).

import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { svelteKitHandler } from 'better-auth/svelte-kit'
import { building, dev } from '$app/environment'
import { sequence } from '@sveltejs/kit/hooks'
import { redirect, type Handle } from '@sveltejs/kit'
import { touchPresence } from '$lib/server/presence'
// Валідація redirectTo живе в $lib/utils/redirect.ts (ізоморфний util),
// нею користується login-form при поверненні користувача після входу.

// ═══════════════════ Better-auth handler ═══════════════════

const authHandle: Handle = async ({ event, resolve }) => {
  // Для /api/auth/* повертає власну відповідь (далі по ланцюжку не йде).
  // Для решти — просто викликає resolve (тобто наступні handles).
  return svelteKitHandler({ event, resolve, auth, building })
}

// ═══════════════════ Сесія → locals ═══════════════════

const sessionHandle: Handle = async ({ event, resolve }) => {
  // route.id === null → запит не зматчився з жодним роутом (404, статика в dev).
  // Сесія там не потрібна — не ходимо в better-auth даремно.
  if (event.route.id === null) {
    event.locals.session = null
    event.locals.user = null
    return resolve(event)
  }

  const session = await auth.api
    .getSession({ headers: event.request.headers })
    .catch(() => null) // збій auth-шару = аноним, а не 500 на весь сайт

  event.locals.session = session
  event.locals.user = session?.user ?? null

  if (session) touchPresence(session.user.id)

  return resolve(event)
}

// ═══════════════════ Route guards ═══════════════════

/** Сторінки, що вимагають сесію. Все дерево /dashboard. */
const PROTECTED_PREFIX = '/dashboard'

/** Сторінки тільки для гостей: залогіненому тут нема чого робити. */
const GUEST_ONLY = new Set(['/user/login', '/user/register'])
// /user/forgot та /user/reset-password навмисно НЕ guest-only:
// юзер може бути залогінений і при цьому скидати пароль за листом.

const guardHandle: Handle = async ({ event, resolve }) => {
  const { pathname, search } = event.url
  const session = event.locals.session

  // API захищає себе сам (кожен endpoint перевіряє locals/session/Bearer) —
  // hooks-редіректи для API безглузді: fetch-клієнту потрібен 401, не 302.
  if (pathname.startsWith('/api/')) return resolve(event)

  // ─── Залогінений на публічній головній "/" → його домашня /dashboard ───
  // Точна перевірка pathname === '/' (не startsWith!): інші публічні
  // сторінки (/privacy, /terms, /@username, /master/about) лишаються
  // доступними залогіненому — редіректимо ЛИШЕ з лендінга.
  if (session && pathname === '/') {
    redirect(303, '/dashboard')
  }

  // ─── Guest-only: залогінений на /user/login|register → /dashboard ───
  if (session && GUEST_ONLY.has(pathname)) {
    redirect(303, '/dashboard')
  }
  // Далі — тільки захищене дерево
  if (!pathname.startsWith(PROTECTED_PREFIX)) return resolve(event)

  // ─── Немає сесії → на логін, із поверненням куди йшов ───
  if (!session) {
    const target = encodeURIComponent(pathname + search)
    redirect(303, `/user/login?redirectTo=${target}`)
  }

  // ─── Onboarding-замок ───
  // Новий флоу: роль обирається НА онбордингу (не при реєстрації), тож
  // свіжий юзер завжди йде на /dashboard/onboarding, доки не завершить його.
  // Саму сторінку онбордингу пропускаємо, інакше redirect-петля.
  const ONBOARDING_PATH = '/dashboard/onboarding'
  const isOnboardingPage = pathname.startsWith(ONBOARDING_PATH)

  if (!isOnboardingPage) {
    // Один легкий SELECT лише на dashboard-сторінках.
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboarded: true, banned: true },
    })

    // Сесія є, а юзера в БД нема (видалений) — сесія недійсна, на логін.
    if (!user) redirect(303, '/user/login')

    // Профіль не завершено → замикаємо на онбордингу. Вийти не можна,
    // доки не збереже роль + обовʼязкові поля (сервер виставить onboarded).
    if (!user.onboarded) {
      redirect(303, ONBOARDING_PATH)
    }
  } else if (session) {
    // Уже завершив онбординг, але зайшов на /onboarding → на дашборд.
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboarded: true },
    })
    if (user?.onboarded) redirect(303, '/dashboard')
  }

  return resolve(event)
}

// ═══════════════════ Security headers ═══════════════════

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event)

  // Захищені сторінки не можна кешувати: після logout браузер не має
  // права показати їх з дискового кешу. Бонус: no-store у більшості
  // браузерів також виключає сторінку з bfcache.
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
    `script-src 'self' 'unsafe-inline' https://js.pusher.com https://cdn.jsdelivr.net`,
    `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`,
    `img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com`,
    `media-src 'self' blob: https://res.cloudinary.com`,
    `font-src 'self' data:`,
    `connect-src 'self' https://api.cloudinary.com https://*.pusher.com wss://*.pusher.com https://sockjs-eu.pusher.com https://sockjs-mt1.pusher.com https://sockjs-ap1.pusher.com https://sockjs-ap2.pusher.com`,
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ')

  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  // Узгоджено з CSP frame-ancestors 'none' (раніше стояв SAMEORIGIN — конфлікт)
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

// securityHeaders — ПЕРШИМ: у sequence перший handle обгортає всі наступні,
// тож заголовки отримують і відповіді svelteKitHandler для /api/auth/*
// (він повертає їх сам, не викликаючи resolve — останній handle їх не бачив би).
export const handle = sequence(
  securityHeaders,
  authHandle,
  sessionHandle,
  guardHandle,
)
