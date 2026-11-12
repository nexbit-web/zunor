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

const OTP_TTL_SECONDS = 600 // 10 хв — довше, ніж середня затримка SMTP

export const auth = betterAuth({
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,

  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  // Стандартна реєстрація створює користувача ДО підтвердження пошти —
  // у базі лишались непідтверджені акаунти з чужими адресами. Реєстрація
  // тепер — плагін registration (./registration.ts): користувач
  // зʼявляється лише з кодом із листа. Старий шлях закритий для всіх
  // (404), щоб його не можна було смикнути в обхід.
  disabledPaths: ['/sign-up/email'],

  // Сесії й одноразові коди — у Redis (auth-storage.ts): перевірка сесії
  // на кожен запит не будить Neon. Без Redis — undefined, усе в базі.
  secondaryStorage: authStorage,

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
    // Новий пароль — усі сесії людини геть (Redis і база; better-auth кличе
    // deleteUserSessions(userId), не deleteSessions — див. sessions.ts).
    // Пароль скидають і тоді, коли його вкрали: без цього той, хто вже
    // увійшов, лишався б в акаунті й після зміни. Діє на обидва шляхи —
    // посилання сайту й код застосунку (emailOTP); застосунок одразу
    // входить заново новим паролем. Кеш сесії в cookie (cookieCache, 5 хв)
    // на чужому пристрої може протриматись до кінця свого строку.
    revokeSessionsOnPasswordReset: true,
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
    // Сесія пишеться і в базу: Redis — копія, а не єдине місце. Сесії,
    // створені до Redis, і промах у ньому читаються з бази.
    storeSessionInDatabase: true,
  },

  // Поле користувача змінив сам better-auth (підтвердження пошти тощо) —
  // guard має перечитати стан акаунта, а не тримати кеш.
  databaseHooks: {
    user: {
      update: {
        after: async (user) => {
          await invalidateAccount(user.id)
        },
      },
    },
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
      '/email-otp/send-verification-otp': { window: 60, max: 2 },
      '/email-otp/verify-email': { window: 60, max: 5 },
      '/request-password-reset': { window: 3600, max: 5 },
      '/get-session': false, // дзвониться на кожен перехід, лімітувати нічого
    },
    // memory тримає ліміти в одному процесі (Hostinger). На Vercel копій
    // функції кілька — там ліміти в Redis, поруч із сесіями
    // (secondaryStorage), інакше перебір пароля ділився б між копіями.
    storage: serverless && authStorage ? 'secondary-storage' : 'memory',
  },

  trustedOrigins: [
    BETTER_AUTH_URL,
    // Мобільний застосунок (../mobile): плагін expo() бере походження
    // запиту з його заголовка, і це має бути наша схема.
    'zunor://',
    ...(dev ? ['http://localhost:5173', 'http://localhost:4173'] : []),
    // Застосунок у Expo Go має адресу exp://<IP>:8081. Лише в dev і на
    // ТЕСТОВОМУ деплої з ZUNOR_EXPO_GO=1 (Vercel, щоб ганяти застосунок
    // проти нього): на бойовому exp:// пустив би будь-який проєкт з Expo Go.
    ...(dev || env.ZUNOR_EXPO_GO === '1'
      ? ['exp://', 'exp://**', 'exp://192.168.*.*:*/**']
      : []),
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
        // інакше різниця в затримці видає, існує адреса чи ні. Але й не
        // голий void: на Vercel функцію заморозили б до відправки листа.
        background(sendOtpEmail({ email, otp, type }), 'otp email')
      },
    }),
    // Реєстрація з кодом ДО створення користувача (див. disabledPaths).
    registration({
      otpExpiresIn: OTP_TTL_SECONDS,
      // Той самий лист «Код підтвердження», що й підтвердження пошти.
      sendCode: ({ email, otp }) =>
        background(
          sendOtpEmail({ email, otp, type: 'email-verification' }),
          'registration otp',
        ),
    }),
    // Вхід із мобільного застосунку: у нативного запиту немає Origin —
    // плагін бере його з заголовка expo-origin (перевіряється trustedOrigins).
    expo(),
    // sveltekitCookies має бути ОСТАННІМ у масиві.
    sveltekitCookies(getRequestEvent),
  ],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
