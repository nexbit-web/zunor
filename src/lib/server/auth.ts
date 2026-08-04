import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { emailOTP } from 'better-auth/plugins'
import { sveltekitCookies } from 'better-auth/svelte-kit'
import { getRequestEvent } from '$app/server'
import { dev } from '$app/environment'
import {
  BETTER_AUTH_URL,
  BETTER_AUTH_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} from '$env/static/private'
import { prisma } from './prisma'
import { sendResetPasswordEmail } from './email'
import { sendOtpEmail } from './email/otp-email'
 

const OTP_TTL_SECONDS = 600 // 10 хв — довше, ніж середня затримка SMTP

export const auth = betterAuth({
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,

  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  // ─── Google OAuth ───
  socialProviders: {
    google: {
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      // Явний вибір акаунта: інакше Google мовчки логінить останній
      // використаний, і юзер не розуміє, під ким він зайшов.
      prompt: 'select_account',
    },
  },

  // ─── Звʼязування акаунтів ───
  // Сценарій: зареєструвався паролем → потім тисне «Продовжити з Google».
  // Без linking це або дубль-акаунт, або помилка. Google верифікує email,
  // тож довіряємо йому як джерелу правди про адресу.
  //
  // allowDifferentEmails: false — критично. З true чужий OAuth-акаунт
  // можна причепити до існуючого юзера й зайти під ним.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
      allowDifferentEmails: false,
      // Не перезаписуємо name/avatar, які юзер обрав на онбордингу.
      updateUserInfoOnLink: false,
    },
  },

  // ─── Email + password ───
  emailAndPassword: {
    enabled: true,
    // Завжди, і в dev теж: інакше боєвий флоу не тестується жодного разу
    // до продакшену. Код у dev дублюється в консоль (див. otp-email.ts).
    requireEmailVerification: true,
    // Сесію при реєстрації не створюємо: спершу підтвердження пошти,
    // сесія зʼявиться після верифікації (autoSignInAfterVerification).
    autoSignIn: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,

    sendResetPassword: async ({ user, url }) => {
      try {
        await sendResetPasswordEmail({
          to: user.email,
          name: user.name,
          resetUrl: url,
        })
      } catch (err) {
        // Тихо: інакше відповідь «лист не пішов» видає, що email існує.
        console.error('[auth] reset password email failed:', err)
      }
    },
    resetPasswordTokenExpiresIn: 3600,
  },

  // ─── Верифікація email ───
  emailVerification: {
    sendOnSignUp: true,
    // Після введення коду одразу створюємо сесію — юзер не вводить
    // пароль вдруге. Далі його підхоплює замок онбордингу.
    autoSignInAfterVerification: true,
    expiresIn: OTP_TTL_SECONDS,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  advanced: {
    useSecureCookies: !dev,
    defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, secure: !dev },
    cookiePrefix: 'zunor',
  },

  // ─── Rate limiting ───
  // Вмикаємо і в dev: ліміти — частина флоу, їх треба бачити при розробці,
  // інакше 429 вперше прилітає від живого користувача.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 3600, max: 5 },
      '/email-otp/send-verification-otp': { window: 60, max: 2 },
      '/email-otp/verify-email': { window: 60, max: 5 },
      '/request-password-reset': { window: 3600, max: 5 },
      '/get-session': false, // дзвониться на кожен перехід, лімітувати нічого
    },
    // memory тримає ліміти в одному процесі. Перед горизонтальним
    // масштабуванням → 'database' + `npx @better-auth/cli generate`
    // (він додасть модель rateLimit у schema.prisma).
    storage: 'memory',
  },

  trustedOrigins: [
    BETTER_AUTH_URL,
    ...(dev ? ['http://localhost:5173', 'http://localhost:4173'] : []),
  ],

  user: {
    fields: { image: 'avatar' },
    additionalFields: {
      // input: false — ЖОДНЕ з цих полів не приймається з тіла запиту.
      // Було input: true на role, а в enum є ADMIN/MANAGER/MODERATOR:
      // будь-хто міг зареєструватись адміном. Роль виставляє сервер
      // на онбордингу, banned/onboarded — теж тільки сервер.
      role: { type: 'string', defaultValue: 'CLIENT', input: false },
      city: { type: 'string', required: false, input: false },
      onboarded: { type: 'boolean', defaultValue: false, input: false },
      banned: { type: 'boolean', defaultValue: false, input: false },
    },
  },

  plugins: [
    emailOTP({
      // Верифікація email іде кодом, а не посиланням.
      overrideDefaultEmailVerification: true,
      otpLength: 6,
      expiresIn: OTP_TTL_SECONDS,
      // Після 5 невдалих спроб код згорає — брутфорс 6 цифр неможливий
      // навіть якщо хтось обійде rate limit.
      allowedAttempts: 5,
      // У БД лежить хеш: дамп таблиці verification не дає живих кодів.
      storeOTP: 'hashed',
      // Ми не використовуємо OTP як спосіб входу — тільки як підтвердження.
      // Без цього /sign-in/email-otp мовчки створює акаунти в обхід реєстрації.
      disableSignUp: true,

      sendVerificationOTP: async ({ email, otp, type }) => {
        // Не await: час відповіді не повинен залежати від SMTP,
        // інакше різниця в затримці видає, існує адреса чи ні.
        void sendOtpEmail({ email, otp, type }).catch((err) => {
          console.error('[auth] otp email failed:', err)
        })
      },
    }),
    // sveltekitCookies має бути ОСТАННІМ у масиві.
    sveltekitCookies(getRequestEvent),
  ],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
