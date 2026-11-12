// Реєстрація поштою — користувач зʼявляється в базі ЛИШЕ після коду з
// листа. Стандартний /sign-up/email better-auth створює його одразу
// (emailVerified: false), і в базі лишались люди з чужими чи вигаданими
// адресами, а чужу пошту можна було «зайняти» своїм паролем. Тому той шлях
// вимкнено (disabledPaths у auth.ts), а замість нього — цей плагін:
//
//   POST /registration/start  { name, email, password } — заявка: імʼя,
//        хеш пароля (той самий password.hash, що в better-auth) і хеш коду
//        лежать у таблиці verification; лист із кодом. Користувача немає.
//   POST /registration/resend { email } — новий код для тієї ж заявки.
//   POST /registration/verify { email, otp } — вірний код: користувач
//        (emailVerified: true), вхід паролем і сесія — тими ж функціями,
//        що в better-auth (internalAdapter, setSessionCookie).
//
// Відповіді start і resend однакові, є акаунт чи ні: інакше форма
// реєстрації стала б оракулом «чия пошта зареєстрована». Коди помилок
// verify — ті самі, що в emailOTP (INVALID_OTP, OTP_EXPIRED,
// TOO_MANY_ATTEMPTS): клієнти показують їх уже знайомими текстами.

import { createHash, timingSafeEqual } from 'node:crypto'
import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { generateRandomString } from 'better-auth/crypto'

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const NAME_MIN = 2
const NAME_MAX = 50
const OTP_LENGTH = 6
/** Промахів на один код — як allowedAttempts в emailOTP. */
const MAX_ATTEMPTS = 5
/**
 * Заявка живе добу: код спливає за `otpExpiresIn`, а «Надіслати ще раз»
 * має працювати й після того — пароль людина вдруге не вводить.
 */
const PENDING_TTL_MS = 24 * 60 * 60 * 1000

interface Pending {
  name: string
  passwordHash: string
  /** sha256(код), base64url. Сам код у базі не лежить. */
  otp: string
  otpExpiresAt: number
  attempts: number
}

const identifierOf = (email: string) => `registration-${email}`

function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('base64url')
}

function sameOtp(stored: string, given: string): boolean {
  const a = Buffer.from(stored)
  const b = Buffer.from(hashOtp(given))
  return a.length === b.length && timingSafeEqual(a, b)
}

function normalizeEmail(raw: unknown): string {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (email.length < 3 || email.length > 254 || !EMAIL_RE.test(email)) {
    throw new APIError('BAD_REQUEST', {
      code: 'INVALID_EMAIL',
      message: 'Invalid email',
    })
  }
  return email
}

function parsePending(value: string): Pending | null {
  try {
    const p = JSON.parse(value) as Pending
    return typeof p.passwordHash === 'string' && typeof p.otp === 'string'
      ? p
      : null
  } catch {
    return null
  }
}

const invalidOtp = () =>
  new APIError('BAD_REQUEST', { code: 'INVALID_OTP', message: 'Invalid OTP' })

export interface RegistrationOptions {
  /** Лист із кодом. Не чекаємо: час відповіді не має видавати, чи є акаунт. */
  sendCode: (data: { email: string; otp: string }) => void
  /** Скільки живе код, с. */
  otpExpiresIn: number
}

export const registration = (opts: RegistrationOptions) =>
  ({
    id: 'registration',
    endpoints: {
      registrationStart: createAuthEndpoint(
        '/registration/start',
        { method: 'POST' },
        async (ctx) => {
          const body = (ctx.body ?? {}) as Record<string, unknown>
          const email = normalizeEmail(body.email)
          const name = typeof body.name === 'string' ? body.name.trim() : ''
          const password =
            typeof body.password === 'string' ? body.password : ''

          if (name.length < NAME_MIN || name.length > NAME_MAX) {
            throw new APIError('BAD_REQUEST', {
              code: 'INVALID_NAME',
              message: `Name must be ${NAME_MIN}-${NAME_MAX} characters`,
            })
          }
          const { minPasswordLength, maxPasswordLength } =
            ctx.context.password.config
          if (password.length < minPasswordLength) {
            throw new APIError('BAD_REQUEST', {
              code: 'PASSWORD_TOO_SHORT',
              message: 'Password too short',
            })
          }
          if (password.length > maxPasswordLength) {
            throw new APIError('BAD_REQUEST', {
              code: 'PASSWORD_TOO_LONG',
              message: 'Password too long',
            })
          }

          // Хеш — завжди, і для зайнятої пошти: інакше за часом відповіді
          // видно, що акаунт уже є.
          const passwordHash = await ctx.context.password.hash(password)

          // Підтверджений акаунт уже є — та сама відповідь, без листа.
          // Непідтверджений (зі старого шляху) — заявка, як для нової: код
          // доведе, що пошта людини, і verify передасть акаунт їй.
          const existing =
            await ctx.context.internalAdapter.findUserByEmail(email)
          if (existing?.user.emailVerified) return ctx.json({ success: true })

          const otp = generateRandomString(OTP_LENGTH, '0-9')
          const pending: Pending = {
            name,
            passwordHash,
            otp: hashOtp(otp),
            otpExpiresAt: Date.now() + opts.otpExpiresIn * 1000,
            attempts: 0,
          }
          const identifier = identifierOf(email)
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(
            identifier,
          )
          await ctx.context.internalAdapter.createVerificationValue({
            identifier,
            value: JSON.stringify(pending),
            expiresAt: new Date(Date.now() + PENDING_TTL_MS),
          })
          opts.sendCode({ email, otp })
          return ctx.json({ success: true })
        },
      ),

      registrationResend: createAuthEndpoint(
        '/registration/resend',
        { method: 'POST' },
        async (ctx) => {
          const body = (ctx.body ?? {}) as Record<string, unknown>
          const email = normalizeEmail(body.email)
          const identifier = identifierOf(email)
          const row =
            await ctx.context.internalAdapter.findVerificationValue(identifier)
          const pending =
            row && row.expiresAt > new Date() ? parsePending(row.value) : null
          // Заявки немає — та сама відповідь: нічого не розповідаємо.
          if (!pending) return ctx.json({ success: true })

          const otp = generateRandomString(OTP_LENGTH, '0-9')
          await ctx.context.internalAdapter.updateVerificationByIdentifier(
            identifier,
            {
              value: JSON.stringify({
                ...pending,
                otp: hashOtp(otp),
                otpExpiresAt: Date.now() + opts.otpExpiresIn * 1000,
                attempts: 0,
              } satisfies Pending),
            },
          )
          opts.sendCode({ email, otp })
          return ctx.json({ success: true })
        },
      ),

      registrationVerify: createAuthEndpoint(
        '/registration/verify',
        { method: 'POST' },
        async (ctx) => {
          const body = (ctx.body ?? {}) as Record<string, unknown>
          const email = normalizeEmail(body.email)
          const otp = typeof body.otp === 'string' ? body.otp.trim() : ''
          const identifier = identifierOf(email)
          const adapter = ctx.context.internalAdapter

          const row = await adapter.findVerificationValue(identifier)
          const pending =
            row && row.expiresAt > new Date() ? parsePending(row.value) : null
          if (!pending || !otp) throw invalidOtp()
          if (pending.attempts >= MAX_ATTEMPTS) {
            throw new APIError('FORBIDDEN', {
              code: 'TOO_MANY_ATTEMPTS',
              message: 'Too many attempts',
            })
          }
          if (pending.otpExpiresAt < Date.now()) {
            throw new APIError('BAD_REQUEST', {
              code: 'OTP_EXPIRED',
              message: 'OTP expired',
            })
          }
          if (!sameOtp(pending.otp, otp)) {
            await adapter.updateVerificationByIdentifier(identifier, {
              value: JSON.stringify({
                ...pending,
                attempts: pending.attempts + 1,
              } satisfies Pending),
            })
            throw invalidOtp()
          }

          // Код вірний — заявку геть ДО створення: два однакові запити
          // поспіль не створять двох користувачів.
          await adapter.deleteVerificationByIdentifier(identifier)

          const existing = await adapter.findUserByEmail(email, {
            includeAccounts: true,
          })
          let user
          if (existing?.user.emailVerified) {
            // Поки людина вводила код, акаунт зʼявився іншим шляхом
            // (Google). Пароль чужого входу не чіпаємо — хай увійде.
            throw new APIError('UNPROCESSABLE_ENTITY', {
              code: 'USER_ALREADY_EXISTS',
              message: 'User already exists',
            })
          } else if (existing) {
            // Непідтверджений акаунт зі старого шляху: код довів, що пошта
            // цієї людини, — акаунт її, з її паролем. Чужі сесії (якщо
            // були) — геть.
            const id = existing.user.id
            if (existing.accounts.some((a) => a.providerId === 'credential')) {
              await adapter.updatePassword(id, pending.passwordHash)
            } else {
              await adapter.linkAccount({
                userId: id,
                providerId: 'credential',
                accountId: id,
                password: pending.passwordHash,
              })
            }
            await adapter.deleteUserSessions(id)
            user = await adapter.updateUser(id, {
              name: pending.name,
              emailVerified: true,
            })
          } else {
            try {
              user = await adapter.createUser({
                email,
                name: pending.name,
                emailVerified: true,
              })
            } catch {
              // Унікальна пошта: хтось устиг тим самим листом раніше.
              throw new APIError('UNPROCESSABLE_ENTITY', {
                code: 'USER_ALREADY_EXISTS',
                message: 'User already exists',
              })
            }
            await adapter.linkAccount({
              userId: user.id,
              providerId: 'credential',
              accountId: user.id,
              password: pending.passwordHash,
            })
          }

          // Одразу всередині, як було з autoSignInAfterVerification: пароль
          // удруге не вводити.
          const session = await adapter.createSession(user.id)
          await setSessionCookie(ctx, { session, user })
          return ctx.json({
            status: true,
            token: session.token,
            user: { id: user.id, email: user.email, name: user.name },
          })
        },
      ),
    },
    // Як у старого /sign-up/email і emailOTP.
    rateLimit: [
      {
        pathMatcher: (path: string) => path === '/registration/start',
        window: 3600,
        max: 5,
      },
      {
        pathMatcher: (path: string) => path === '/registration/resend',
        window: 60,
        max: 2,
      },
      {
        pathMatcher: (path: string) => path === '/registration/verify',
        window: 60,
        max: 5,
      },
    ],
  }) satisfies BetterAuthPlugin
