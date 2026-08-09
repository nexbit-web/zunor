// Заглушка для $env/dynamic/private. Див. пояснення в env-static-private.ts.

export const env: Record<string, string | undefined> = {
  CLOUDINARY_CLOUD_NAME: 'test-cloud',
  CLOUDINARY_API_KEY: 'test-key',
  CLOUDINARY_API_SECRET: 'test-secret',
  PUSHER_APP_ID: 'test-app',
  PUSHER_SECRET: 'test-secret',
  PUBLIC_PUSHER_KEY: 'test-pusher-key',
  PUBLIC_PUSHER_CLUSTER: 'eu',
}
