// * ліміт на пошту для кодів із листа. Ліміти better-auth рахуються за IP, а
// * код — шість цифр: з пулом проксі його можна підбирати. Бюджет на адресу
// * спільний на всі шляхи й не залежить від того, чи є такий акаунт.
// * Ціна: хто знає чужу пошту, може на добу закрити їй коди — свідомий вибір

import { createHash } from 'node:crypto'
import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { prisma } from './prisma'
import { limit } from './rate-limit'

// * шляхи better-auth, закриті для всіх (404) — бібліотека відкриває їх сама:
// *   /sign-up/email — створює користувача до підтвердження пошти
// *   /sign-in/email-otp — шість цифр замість пароля
// *   /forget-password/email-otp — двійник скидання зі своїм бюджетом ліміту
// *   /update-user — писав аватар та імʼя в обхід наших перевірок
export const DISABLED_AUTH_PATHS: readonly string[] = [
  '/sign-up/email',
  '/sign-in/email-otp',
  '/forget-password/email-otp',
  '/update-user',
]

// * заблокований (видалений — теж бан) нової сесії не отримує. Базу читаємо
// * напряму: кеш акаунта запамʼятав би «користувача немає» для щойно створеного
export async function refuseBannedSession(session: {
  userId: string
}): Promise<false | void> {
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { banned: true },
  })
  if (user?.banned) return false
}

const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * HOUR_MS

/** Скільки листів (код або посилання) може піти на одну пошту. */
export const SEND_PER_HOUR = 6
export const SEND_PER_DAY = 20
/** Скільки разів можна перевіряти код для однієї пошти. */
export const VERIFY_PER_HOUR = 10
export const VERIFY_PER_DAY = 30

/** Шляхи, що шлють лист на адресу з тіла запиту. */
export const SEND_PATHS: readonly string[] = [
  '/registration/start',
  '/registration/resend',
  '/email-otp/send-verification-otp',
  '/email-otp/request-password-reset',
  '/forget-password/email-otp',
  '/request-password-reset',
  '/send-verification-email',
]

/** Шляхи, що перевіряють код із листа. */
export const VERIFY_PATHS: readonly string[] = [
  '/registration/verify',
  '/email-otp/verify-email',
  '/email-otp/check-verification-otp',
  '/email-otp/reset-password',
  '/sign-in/email-otp',
]

const EMAIL_MAX = 254

/** Пошта з тіла запиту в тому вигляді, в якому її бачить better-auth. */
function emailOf(body: unknown): string | null {
  const raw = (body as { email?: unknown } | null | undefined)?.email
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  return email.length > 0 && email.length <= EMAIL_MAX ? email : null
}

const keyOf = (email: string) =>
  createHash('sha256').update(email).digest('hex').slice(0, 32)

const tooMany = () =>
  new APIError('TOO_MANY_REQUESTS', {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many requests. Please try again later.',
  })

// * година перевіряється першою: відмовлений нею запит не зʼїдає добовий бюджет
export async function consumeEmailBudget(
  kind: 'send' | 'verify',
  email: string,
): Promise<boolean> {
  const key = keyOf(email)
  const [perHour, perDay] =
    kind === 'send'
      ? [SEND_PER_HOUR, SEND_PER_DAY]
      : [VERIFY_PER_HOUR, VERIFY_PER_DAY]

  const hour = await limit(`otp-${kind}:h:${key}`, {
    points: perHour,
    duration: HOUR_MS,
  })
  if (!hour.success) return false
  const day = await limit(`otp-${kind}:d:${key}`, {
    points: perDay,
    duration: DAY_MS,
  })
  return day.success
}

const guard = (kind: 'send' | 'verify') =>
  createAuthMiddleware(async (ctx) => {
    const email = emailOf(ctx.body)
    // * без пошти в тілі ендпоінт відмовить сам
    if (!email) return
    if (!(await consumeEmailBudget(kind, email))) throw tooMany()
  })

export const authGuard = () =>
  ({
    id: 'auth-guard',
    hooks: {
      before: [
        {
          matcher: (ctx) => SEND_PATHS.includes(ctx.path ?? ''),
          handler: guard('send'),
        },
        {
          matcher: (ctx) => VERIFY_PATHS.includes(ctx.path ?? ''),
          handler: guard('verify'),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
