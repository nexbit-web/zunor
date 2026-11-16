import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { emailOTP } from 'better-auth/plugins'
import { expo } from '@better-auth/expo'
import { sveltekitCookies } from 'better-auth/svelte-kit'
import { getRequestEvent } from '$app/server'
import { dev } from '$app/environment'
import { env } from '$env/dynamic/private'
import {
  BETTER_AUTH_URL,
  BETTER_AUTH_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} from '$env/static/private'
import { prisma } from './prisma'
import { authStorage } from './auth-storage'
import { invalidateAccount } from './account-cache'
import { sendResetPasswordEmail } from './email'
import { sendOtpEmail } from './email/otp-email'
import { serverless } from './runtime'
import { background } from './background'
import { registration } from './registration'
import {
  authGuard,
  DISABLED_AUTH_PATHS,
  refuseBannedSession,
} from './auth-guard'

// * better-auth довіряє X-Forwarded-For лише з однією адресою. За проксі
// * хостингу задай AUTH_TRUSTED_PROXIES (IP чи CIDR через кому) або
// * AUTH_IP_HEADERS — заголовок, який клієнт підробити не може
const list = (raw: string | undefined) =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
const trustedProxies = list(env.AUTH_TRUSTED_PROXIES)
const ipHeaders = list(env.AUTH_IP_HEADERS).map((h) => h.toLowerCase())

const OTP_TTL_SECONDS = 600 // 10 хв — довше, ніж середня затримка SMTP

export const auth = betterAuth({
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,

  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  // * стандартна реєстрація створює користувача до підтвердження пошти — закрита
  // * разом з іншими зайвими шляхами (auth-guard.ts)
  disabledPaths: [...DISABLED_AUTH_PATHS],

  // * сесії й одноразові коди — у Redis: перевірка сесії не будить базу
  secondaryStorage: authStorage,

  socialProviders: {
    google: {
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      // * інакше Google мовчки логінить останній акаунт, і людина не знає, під ким зайшла
      prompt: 'select_account',
    },
  },

  // * зареєструвався паролем, потім «Продовжити з Google» — той самий акаунт.
  // * allowDifferentEmails: false критично: інакше чужий OAuth чіпляється до акаунта
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
      allowDifferentEmails: false,
      // * імʼя й фото з онбордингу не перезаписуємо
      updateUserInfoOnLink: false,
    },
  },

  emailAndPassword: {
    enabled: true,
    // * і в dev теж: бойовий флоу мусить тестуватись; код дублюється в консоль
    requireEmailVerification: true,
    // * сесія зʼявиться після підтвердження пошти
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
        // * тихо: «лист не пішов» видало б, що пошта зареєстрована
        console.error('[auth] reset password email failed:', err)
      }
    },
    resetPasswordTokenExpiresIn: 3600,
    // * новий пароль — усі сесії людини геть: пароль скидають і тоді, коли його вкрали
    revokeSessionsOnPasswordReset: true,
  },

  emailVerification: {
    sendOnSignUp: true,
    // * після коду одразу сесія — пароль удруге не питаємо
    autoSignInAfterVerification: true,
    expiresIn: OTP_TTL_SECONDS,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
    // * Redis — копія, а не єдине місце: промах у ньому читається з бази
    storeSessionInDatabase: true,
  },

  // * поле змінив сам better-auth (підтвердження пошти) — кеш стану акаунта геть
  databaseHooks: {
    user: {
      update: {
        after: async (user) => {
          await invalidateAccount(user.id)
        },
      },
    },
    // * заблокований (видалений — теж бан) нової сесії не отримує
    session: { create: { before: refuseBannedSession } },
  },

  advanced: {
    useSecureCookies: !dev,
    defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, secure: !dev },
    cookiePrefix: 'zunor',
    ...(trustedProxies.length > 0 || ipHeaders.length > 0
      ? {
          ipAddress: {
            ...(ipHeaders.length > 0 ? { ipAddressHeaders: ipHeaders } : {}),
            ...(trustedProxies.length > 0 ? { trustedProxies } : {}),
          },
        }
      : {}),
  },

  // * і в dev теж: інакше 429 уперше прилітає живій людині
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    // * це ліміти за IP; коди з листа лімітуються ще й за поштою (auth-guard.ts)
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/email-otp/send-verification-otp': { window: 60, max: 2 },
      '/email-otp/verify-email': { window: 60, max: 5 },
      '/request-password-reset': { window: 3600, max: 5 },
      '/get-session': false, // дзвониться на кожен перехід, лімітувати нічого
    },
    // * memory — один процес; на Vercel копій кілька, там ліміти в Redis
    storage: serverless && authStorage ? 'secondary-storage' : 'memory',
  },

  trustedOrigins: [
    BETTER_AUTH_URL,
    // * схема мобільного застосунку: плагін expo() бере походження з його заголовка
    'zunor://',
    ...(dev ? ['http://localhost:5173', 'http://localhost:4173'] : []),
    // * Expo Go — лише dev і тестовий деплой: на бойовому exp:// пустив би будь-який проєкт
    ...(dev || env.ZUNOR_EXPO_GO === '1'
      ? ['exp://', 'exp://**', 'exp://192.168.*.*:*/**']
      : []),
  ],

  user: {
    fields: { image: 'avatar' },
    additionalFields: {
      // * input: false — з тіла запиту не приймається жодне: роль і бан ставить лише сервер
      role: { type: 'string', defaultValue: 'CLIENT', input: false },
      city: { type: 'string', required: false, input: false },
      onboarded: { type: 'boolean', defaultValue: false, input: false },
      banned: { type: 'boolean', defaultValue: false, input: false },
    },
  },

  plugins: [
    emailOTP({
      // * підтвердження пошти — кодом, а не посиланням
      overrideDefaultEmailVerification: true,
      otpLength: 6,
      expiresIn: OTP_TTL_SECONDS,
      // * після 5 невдалих спроб код згорає
      allowedAttempts: 5,
      // * у базі хеш: дамп таблиці не дає живих кодів
      storeOTP: 'hashed',
      // * код — лише підтвердження, не спосіб входу: інакше /sign-in/email-otp створював би акаунти
      disableSignUp: true,

      sendVerificationOTP: async ({ email, otp, type }) => {
        // * не await: затримка SMTP видавала б, чи існує адреса. І не голий void —
        // * на Vercel функцію заморозили б до відправки
        background(sendOtpEmail({ email, otp, type }), 'otp email')
      },
    }),
    // * реєстрація з кодом до створення користувача
    registration({
      otpExpiresIn: OTP_TTL_SECONDS,
      // * той самий лист, що й для підтвердження пошти
      sendCode: ({ email, otp }) =>
        background(
          sendOtpEmail({ email, otp, type: 'email-verification' }),
          'registration otp',
        ),
    }),
    // * ліміт на пошту для шляхів, що шлють чи перевіряють код
    authGuard(),
    // * у нативного запиту немає Origin — плагін бере його з заголовка expo-origin
    expo(),
    // * має бути останнім у масиві
    sveltekitCookies(getRequestEvent),
  ],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
