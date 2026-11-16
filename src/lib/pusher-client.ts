import Pusher from 'pusher-js'
import { env } from '$env/dynamic/public'
import { browser } from '$app/environment'

/** Клієнтський Pusher — синглтон. Private- і presence-канали підписує /api/pusher/auth. */

let instance: Pusher | null = null

export function getPusher(): Pusher {
  if (!browser) {
    throw new Error('Pusher client can only be used in the browser')
  }
  if (instance) return instance

  instance = new Pusher(env.PUBLIC_PUSHER_KEY!, {
    cluster: env.PUBLIC_PUSHER_CLUSTER ?? 'eu',
    forceTLS: true,
    authEndpoint: '/api/pusher/auth',
    authTransport: 'ajax',
  })

  // * логування для дебагу — приберіть у проді
  if (import.meta.env.DEV) {
    instance.connection.bind('state_change', (s: { current: string }) => {
      console.log('[Pusher]', s.current)
    })
    instance.connection.bind('error', (err: unknown) => {
      console.error('[Pusher] error', err)
    })
  }

  return instance
}

/**
 * Cleanup — викликати при logout.
 */
export function disconnectPusher() {
  if (instance) {
    instance.disconnect()
    instance = null
  }
}
