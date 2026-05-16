// src/hooks.server.ts
import { auth } from '$lib/auth'
import { svelteKitHandler } from 'better-auth/svelte-kit'
import { building, dev } from '$app/environment'
import { sequence } from '@sveltejs/kit/hooks'
import type { Handle } from '@sveltejs/kit'

const authHandle: Handle = async ({ event, resolve }) => {
  return svelteKitHandler({ event, resolve, auth, building })
}

/**
 * Security headers + CSP.
 *
 * connect-src має включати усі домени до яких клієнт робить XHR/WebSocket:
 *   - 'self'                       — наш бекенд
 *   - https://api.cloudinary.com   — завантаження медіа
 *   - https://*.pusher.com         — REST API Pusher
 *   - wss://*.pusher.com           — WebSocket
 *   - https://sockjs-*.pusher.com  — fallback для старих браузерів
 *
 * У dev-режимі — менш суворе CSP, щоб HMR і Vite-overlay працювали.
 */
const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event)

  if (dev) {
    // У dev НЕ ставимо CSP — інакше HMR і інспектор ламаються.
    // Ставимо тільки безпечні базові заголовки.
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
    // ↓ ОБОВ'ЯЗКОВО для Pusher
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

export const handle = sequence(authHandle, securityHeaders)
