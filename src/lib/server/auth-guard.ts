// Ліміт на ПОШТУ для кодів із листа — плагін better-auth.
//
// Чому мало лімітів better-auth. Вони рахуються за IP і шляхом, а код із
// листа — шість цифр. На один код дається 5 спроб, але НОВИХ кодів можна
// було просити скільки завгодно: з сотнею проксі це тисячі спроб на добу на
// одну адресу, тобто підбір коду скидання пароля (а з ним — чужий акаунт,
// зокрема співробітника) за день-два. Той самий перебір — і для коду
// реєстрації: «Надіслати ще раз» скидав лічильник спроб.
//
// Тому поруч із лімітом за IP — ліміт за самою адресою, спільний на всі
// шляхи одразу (інакше бюджет множився б на кількість шляхів):
//   • листів із кодом чи посиланням на одну пошту — SEND;
//   • перевірок коду для однієї пошти — VERIFY. Рахуються ВСІ спроби, не
//     лише невдалі: чесній людині вистачає двох-трьох.
// За VERIFY_PER_DAY підбір шестизначного коду — це шанс 0,003 % на добу.
//
// Ліміт не залежить від того, чи є такий акаунт (ключ — рядок пошти), тож
// відповідь «забагато» не стає оракулом «чия пошта зареєстрована».
//
// Лічильники — $lib/server/rate-limit (памʼять процесу, на Vercel — Redis):
// ключ — хеш пошти, тож довжина ключа обмежена, а сама адреса в Redis не
// лежить.
//
// Ціна, про яку треба знати: хто знає чужу пошту, може «спалити» її бюджет
// і на добу закрити їй коди (скидання пароля посиланням із сайту при цьому
// працює). Це свідомий вибір: тимчасова незручність проти втрати акаунта.

import { createHash } from 'node:crypto'
import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { prisma } from './prisma'
import { limit } from './rate-limit'

/**
 * Шляхи better-auth, закриті для всіх (404). Бібліотека відкриває їх сама,
 * а нам вони не потрібні — кожен зайвий шлях входу це ще одна поверхня:
 *
 *   • /sign-up/email — стандартна реєстрація створює користувача ДО
 *     підтвердження пошти; реєстрація в нас — плагін registration;
 *   • /sign-in/email-otp — вхід за кодом із листа. Ні сайт, ні застосунок
 *     ним не користуються, але плагін emailOTP відкриває його сам: шість
 *     цифр замість пароля, і підбір коду давав чужу сесію ТИХО — пароль не
 *     міняється, сесії власника живі;
 *   • /forget-password/email-otp — застарілий двійник
 *     /email-otp/request-password-reset: ще один шлях до того самого листа
 *     й ще один бюджет ліміту;
 *   • /update-user — стандартне «змінити імʼя й фото». Він писав `image`
 *     (у нас це колонка avatar) як є: аватаром ставало будь-яке посилання
 *     в обхід $lib/server/own-media, імʼя — без наших меж. Профіль міняють
 *     лише /api/profile/* і /api/user/media.
 *
 * Повертаєш якийсь зі шляхів — спершу закрий те, через що його закрили.
 */
export const DISABLED_AUTH_PATHS: readonly string[] = [
  '/sign-up/email',
  '/sign-in/email-otp',
  '/forget-password/email-otp',
  '/update-user',
]

/**
 * Замок на створення сесії (databaseHooks.session.create.before в auth.ts):
 * заблокований (і видалений — це теж бан) нової сесії не отримує. Бан
 * відкликає живі сесії, але ніщо не заважало увійти знову: сторінки сайту
 * таку сесію вбивали (guardHandle), а застосунок і /api/auth/* жили з нею
 * далі. `false` — better-auth сесію не створює: вхід паролем відповідає
 * 401, вхід через Google повертає на сторінку з помилкою.
 *
 * Читаємо базу напряму, а не кеш стану акаунта (account-cache): той
 * запамʼятовує й відповідь «користувача немає». Якщо сесія створюється в
 * тій самій транзакції, що й щойно зареєстрований користувач, окреме
 * зʼєднання його ще не бачить — і новачок на кілька хвилин лишився б у
 * кеші «неіснуючим» (сторінки гнали б його на вхід, API відповідав 401).
 * Вхід — подія рідкісна, один короткий запит тут нічого не коштує.
 */
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

/**
 * Один крок бюджету для пошти. Година перевіряється першою: відмовлений
 * нею запит не зʼїдає добовий бюджет.
 */
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
    // Без пошти в тілі сам ендпоінт відмовить — рахувати нема чого.
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
