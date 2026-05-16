import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  BETTER_AUTH_URL,
  BETTER_AUTH_SECRET,
  DATABASE_URL,
} from '$env/static/private'
import { dev } from '$app/environment'
import { sendResetPasswordEmail } from './email'

// ─── Prisma client (singleton) ───
// HMR у dev може створювати нові інстанси при кожному hot-reload —
// тому в dev зберігаємо інстанс на globalThis, інакше відкриваються
// сотні з'єднань і Postgres вибиває "too many connections".
const adapter = new PrismaPg({ connectionString: DATABASE_URL })

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: dev ? ['warn', 'error'] : ['error'],
  })

if (dev) globalForPrisma.prisma = prisma

// ─── Better-auth ───
export const auth = betterAuth({
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,

  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  // ─── Email + password ───
  emailAndPassword: {
    enabled: true,

    // На dev — вимкнено, щоб швидко тестувати без OTP-перевірок.
    // На прод — вимагаємо верифікацію через ваш OTP-flow.
    requireEmailVerification: !dev,

    // Мінімальна довжина пароля (узгоджено з фронтенд-валідацією у register-form).
    minPasswordLength: 8,
    maxPasswordLength: 128,

    // Скидання паролю — токен з email-листа.
    sendResetPassword: async ({ user, url }) => {
      try {
        await sendResetPasswordEmail({
          to: user.email,
          name: user.name,
          resetUrl: url,
        })
        if (dev) console.log('[auth] reset password email sent to', user.email)
      } catch (err) {
        console.error('[auth] failed to send reset password email:', err)
        // НЕ кидаємо далі — better-auth інакше поверне помилку юзеру,
        // що розкриє: "цей email існує". Тиха невдача = безпечніше
        // (захист від email enumeration).
      }
    },
    // Токен скидання дійсний 1 годину. Менше = безпечніше, але незручно.
    resetPasswordTokenExpiresIn: 3600,
  },

  // ─── Сесія ───
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 днів — стандарт для marketplace
    updateAge: 60 * 60 * 24, // оновлювати сесію раз на добу при активності
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 хв кеш на edge — менше БД-запитів на кожен page-load
    },
  },

  // ─── Cookies ───
  advanced: {
    // На прод — secure cookies (тільки HTTPS).
    // На dev — звичайні (HTTP localhost).
    useSecureCookies: !dev,
    // SameSite=lax — безпечно і сумісно. Strict ламає OAuth-редіректи.
    defaultCookieAttributes: {
      sameSite: 'lax',
      httpOnly: true,
      secure: !dev,
    },
    // Префікс cookie — захист від конфліктів з іншими додатками
    cookiePrefix: 'zunor',
  },

  // ─── Rate limiting ───
  // Захист від брутфорсу пароля та спаму на reset-password.
  rateLimit: {
    enabled: !dev,
    window: 60, // секунди
    max: 10, // запитів на window per IP для AUTH-endpoints
    storage: 'memory', // для одного інстансу. Для багатоінстансового - 'database'.
  },

  // ─── Trusted origins ───
  // Захист від CSRF — better-auth приймає запити тільки з цих доменів.
  trustedOrigins: [
    BETTER_AUTH_URL,
    ...(dev ? ['http://localhost:5173', 'http://localhost:4173'] : []),
  ],

  // ─── Custom user fields ───
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'CLIENT',
        input: true,
      },
      city: {
        type: 'string',
        required: false,
        input: true,
      },
    },
  },
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
