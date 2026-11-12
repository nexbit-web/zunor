import { createAuthClient } from 'better-auth/svelte'
import { emailOTPClient } from 'better-auth/client/plugins'
import type { BetterAuthClientPlugin } from 'better-auth/client'

/** Тіло помилки better-auth: код (`INVALID_OTP`…) і текст. */
type AuthErrorBody = { code?: string; message?: string }

/**
 * Реєстрація з кодом ДО створення користувача ($lib/server/registration):
 * start (імʼя, пошта, пароль → лист із кодом, користувача ще немає),
 * resend, verify (вірний код → користувач і сесія). Схем тіла сервер не
 * описує, тож дії — руками (як у застосунку, mobile/src/lib/auth.ts);
 * verify будить сесію, як вхід.
 */
const registrationClient = () =>
  ({
    id: 'registration',
    getActions: ($fetch, $store) => ({
      registration: {
        start: (body: { name: string; email: string; password: string }) =>
          $fetch<{ success: boolean }, AuthErrorBody>('/registration/start', {
            method: 'POST',
            body,
          }),
        resend: (body: { email: string }) =>
          $fetch<{ success: boolean }, AuthErrorBody>('/registration/resend', {
            method: 'POST',
            body,
          }),
        verify: async (body: { email: string; otp: string }) => {
          const res = await $fetch<{ token: string }, AuthErrorBody>(
            '/registration/verify',
            {
              method: 'POST',
              body,
            },
          )
          if (!res.error) $store.notify('$sessionSignal')
          return res
        },
      },
    }),
  }) satisfies BetterAuthClientPlugin

// baseURL не задаємо: клієнт і сервер на одному origin, відносний шлях
// сам потрапить на /api/auth/*. Явний URL тут ламає прев'ю-деплої.
export const authClient = createAuthClient({
  plugins: [emailOTPClient(), registrationClient()],
})

// signUp.email більше немає (сервер його закрив) — реєстрація лише через
// `registration`.
export const { signIn, signOut, useSession, emailOtp, registration } =
  authClient
