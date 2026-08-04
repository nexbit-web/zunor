import { createAuthClient } from 'better-auth/svelte'
import { emailOTPClient } from 'better-auth/client/plugins'

// baseURL не задаємо: клієнт і сервер на одному origin, відносний шлях
// сам потрапить на /api/auth/*. Явний URL тут ламає прев'ю-деплої.
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
})

export const { signIn, signOut, signUp, useSession, emailOtp } = authClient
