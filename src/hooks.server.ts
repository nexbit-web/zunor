// * порядок ланцюжка критичний: securityHeaders → authHandle → sessionHandle
// * → adminGate → guardHandle. Сесію на запит резолвить лише sessionHandle

import { auth } from '$lib/server/auth'
import { svelteKitHandler } from 'better-auth/svelte-kit'
import { building, dev } from '$app/environment'
import { sequence } from '@sveltejs/kit/hooks'
import { error, redirect, type Handle, type ServerInit } from '@sveltejs/kit'
import { staffOf } from '$lib/server/admin/guard'
import { isVerified } from '$lib/server/admin/step-up'
import { isStaff } from '$lib/admin/roles'
import { touchPresence } from '$lib/server/presence'
import { getAccountState, invalidateAccount } from '$lib/server/account-cache'
import { resumeDispatch } from '$lib/server/dispatch'
import { revokeSessions } from '$lib/server/sessions'
import { productionDeploy, serverless } from '$lib/server/runtime'
import { MODE_SNIPPET } from '$lib/theme-script.server'

const LOGIN_PATH = '/user/login'
const VERIFY_PATH = '/user/verify-email'
const ONBOARDING_PATH = '/dashboard/onboarding'
const HOME_PATH = '/dashboard'
const PROTECTED_PREFIX = '/dashboard'

// * залогіненого звідси веде на дашборд
const GUEST_ONLY = new Set([LOGIN_PATH, '/user/register'])
// * /user/forgot і /user/reset-password сюди не входять: пароль скидає й залогінений

const authHandle: Handle = async ({ event, resolve }) =>
  svelteKitHandler({ event, resolve, auth, building })

const sessionHandle: Handle = async ({ event, resolve }) => {
  // * запит не зматчився з роутом (404, статика в dev) — сесія не потрібна
  if (event.route.id === null) {
    event.locals.session = null
    event.locals.user = null
    event.locals.account = null
    return resolve(event)
  }

  let session = await auth.api
    .getSession({ headers: event.request.headers })
    .catch(() => null) // збій auth-шару = аноним, а не 500 на весь сайт

  // * guardHandle — лише для сторінок, а сесія з cookie-кешу живе ще 5 хв після
  // * відкликання: для API бан перевіряємо тут — забанений стає гостем (401)
  if (session && event.url.pathname.startsWith('/api/')) {
    const account = await getAccountState(session.user.id)
    if (!account || account.banned) session = null
  }

  event.locals.session = session
  event.locals.user = session?.user ?? null
  event.locals.account = null

  if (session) touchPresence(session.user.id)

  return resolve(event)
}

// * перший замок адмінки (другий — requireStaff у кожному load/action):
// * не співробітник бачить 404, співробітник без коду 2FA — лише /admin/2fa

const ADMIN_2FA_PATH = '/admin/2fa'

const adminGate: Handle = async ({ event, resolve }) => {
  const { pathname, search } = event.url
  const isPage = pathname === '/admin' || pathname.startsWith('/admin/')
  const isApi = pathname.startsWith('/api/admin/')
  if (!isPage && !isApi) return resolve(event)

  const staff = await staffOf(event.locals)
  if (!staff) error(404, 'Not found')

  const onTwoFactorPage =
    pathname === ADMIN_2FA_PATH || pathname.startsWith(`${ADMIN_2FA_PATH}/`)

  if (!onTwoFactorPage && !(await isVerified(staff.sessionId))) {
    if (isApi) error(401, 'Потрібен код другого фактора')
    redirect(
      303,
      `${ADMIN_2FA_PATH}?redirectTo=${encodeURIComponent(pathname + search)}`,
    )
  }

  return resolve(event)
}

const guardHandle: Handle = async ({ event, resolve }) => {
  const { pathname, search } = event.url
  const session = event.locals.session

  // * API захищає себе сам: fetch-клієнту потрібен 401, а не редірект на HTML
  if (pathname.startsWith('/api/')) return resolve(event)

  const isProtected = pathname.startsWith(PROTECTED_PREFIX)

  if (!session) {
    if (isProtected) {
      redirect(
        303,
        `${LOGIN_PATH}?redirectTo=${encodeURIComponent(pathname + search)}`,
      )
    }
    return resolve(event)
  }

  // * стан — з бази, а не із сесії: cookie-кеш на 5 хв відстає від бану й верифікації
  const needsAccountState =
    isProtected ||
    pathname === VERIFY_PATH ||
    pathname === '/' ||
    GUEST_ONLY.has(pathname)

  if (!needsAccountState) return resolve(event)

  // * зміни через застосунок скидають цей кеш явно, тож бан діє одразу
  const account = await getAccountState(session.user.id)

  // * сесія є, а користувача в базі немає — сесія недійсна
  if (!account) redirect(303, LOGIN_PATH)

  // * бан: сесії геть і з Redis, і з бази — доступ не повернеться з cookie-кешем
  if (account.banned) {
    await revokeSessions(account.id).catch(() => {})
    await invalidateAccount(account.id)
    redirect(303, `${LOGIN_PATH}?error=banned`)
  }

  // * Google-акаунти сюди не доходять: провайдер підтверджує пошту сам
  if (!account.emailVerified) {
    if (pathname === VERIFY_PATH) return resolve(event)
    redirect(303, VERIFY_PATH)
  }

  if (pathname === VERIFY_PATH) redirect(303, HOME_PATH)

  // * рівно '/', а не префікс: /privacy, /terms і /master/about відкриті залогіненому
  if (pathname === '/' || GUEST_ONLY.has(pathname)) redirect(303, HOME_PATH)

  if (!isProtected) return resolve(event)

  // * співробітник без анкети — не клієнт і не майстер: його місце в адмінці
  if (!account.onboarded && isStaff(account.role)) redirect(303, '/admin')

  // * без онбордингу — лише /dashboard/onboarding/**
  if (!account.onboarded && !pathname.startsWith(ONBOARDING_PATH)) {
    redirect(303, ONBOARDING_PATH)
  }

  // * точне порівняння: /onboarding/master лишається онбордженому клієнту —
  // * це апгрейд ролі
  if (account.onboarded && pathname === ONBOARDING_PATH) {
    redirect(303, HOME_PATH)
  }

  // * стан — далі в locals: load-функції не читають його з бази вдруге
  event.locals.account = {
    id: account.id,
    role: account.role,
    onboarded: account.onboarded,
    emailVerified: account.emailVerified,
  }

  return resolve(event)
}

// * CSP тут немає: її ставить SvelteKit із nonce на сторінку (svelte.config.js)

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event, {
    // * функція, а не рядок: у рядку-заміні `$&` і `$1` службові
    transformPageChunk: ({ html }) =>
      html.replace('%modewatcher.snippet%', () => MODE_SNIPPET),
  })

  // * після виходу сторінку не можна дістати з дискового кешу браузера
  if (event.url.pathname.startsWith('/dashboard')) {
    response.headers.set('Cache-Control', 'no-store, must-revalidate')
  }

  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  if (dev) return response

  response.headers.set('X-Frame-Options', 'DENY')
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

// * хвилі, чиї таймери загинули з попереднім процесом, підхоплюємо на старті — фоном
export const init: ServerInit = () => {
  if (building) return

  // * ліниво, щоб grammY не тягнувся в кожен імпорт hooks. Прев'ю-деплой вебхук
  // * не ставить: перехопив би бота в бойового сайту
  if (productionDeploy) {
    void import('$lib/server/telegram')
      .then(({ startTelegram }) => startTelegram())
      .catch((err) => console.error('[telegram] start failed:', err))
  }

  // * Vercel: таймер після відповіді не живе — хвилі веде QStash, решту — крон
  if (serverless) return

  void resumeDispatch()
    .then(({ checked, caughtUp }) => {
      if (checked > 0) {
        console.log(
          `[dispatch] resumed: checked=${checked} caughtUp=${caughtUp}`,
        )
      }
    })
    .catch((err) => console.error('[dispatch] resume failed:', err))

  // * щоденний таймер о 18:00 за Києвом; крон `reminders` — страховка
  void import('$lib/server/reminders')
    .then(({ startReminders }) => startReminders())
    .catch((err) => console.error('[reminders] start failed:', err))
}

export const handle = sequence(
  securityHeaders,
  authHandle,
  sessionHandle,
  adminGate,
  guardHandle,
)
