// src/hooks.server.ts
import { auth } from '$lib/auth'
import { prisma } from '$lib/prisma'
import { svelteKitHandler } from 'better-auth/svelte-kit'
import { building, dev } from '$app/environment'
import { sequence } from '@sveltejs/kit/hooks'
import { redirect, type Handle } from '@sveltejs/kit'

const authHandle: Handle = async ({ event, resolve }) => {
  return svelteKitHandler({ event, resolve, auth, building })
}

/**
 * Onboarding guard:
 * Майстри без оформленого профілю (verificationStatus === NONE)
 * редіректяться на /onboarding. Виняток — сама /onboarding, API, logout, статика.
 */
const onboardingGuard: Handle = async ({ event, resolve }) => {
  const { url } = event

  // Що пропускаємо одразу
  const skip =
    url.pathname.startsWith('/onboarding') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/user/logout') ||
    url.pathname.startsWith('/user/login') ||
    url.pathname.startsWith('/user/register') ||
    url.pathname.startsWith('/_app/') ||
    url.pathname.includes('.')

  if (skip) return resolve(event)

  // Сесія
  const session = await auth.api
    .getSession({ headers: event.request.headers })
    .catch(() => null)
  if (!session) return resolve(event)

  // Швидка перевірка тільки для MASTER
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      masterProfile: { select: { verificationStatus: true } },
    },
  })

  if (
    user?.role === 'MASTER' &&
    (!user.masterProfile || user.masterProfile.verificationStatus === 'NONE')
  ) {
    throw redirect(302, '/onboarding')
  }

  return resolve(event)
}

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event)

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
  response.headers.set('X-Frame-Options', 'SAMEORIGIN')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  )
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin')

  return response
}

export const handle = sequence(authHandle, onboardingGuard, securityHeaders)
