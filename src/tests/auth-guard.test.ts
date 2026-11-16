import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from './helpers/prisma-mock'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('./helpers/prisma-mock')).prisma,
}))

const {
  authGuard,
  consumeEmailBudget,
  DISABLED_AUTH_PATHS,
  refuseBannedSession,
  SEND_PATHS,
  SEND_PER_DAY,
  SEND_PER_HOUR,
  VERIFY_PATHS,
  VERIFY_PER_DAY,
  VERIFY_PER_HOUR,
} = await import('$lib/server/auth-guard')
const { clearAccountCache } = await import('$lib/server/account-cache')

// Коди з листа — шість цифр. На один код дається 5 спроб, але нових кодів
// можна було просити скільки завгодно, а ліміти better-auth рахуються за IP:
// з пулом проксі це тисячі спроб на добу на одну адресу, тобто підбір коду
// скидання пароля — і чужий акаунт. Тут стережемо другий замок: ліміт за
// САМОЮ поштою, спільний на всі шляхи.

/** Кожен тест бере свою пошту: лічильники живуть у памʼяті модуля. */
let seq = 0
const freshEmail = () => `guard-${++seq}-${Date.now()}@example.com`

beforeEach(() => {
  resetPrisma()
  clearAccountCache()
})

describe('бюджет пошти', () => {
  it('листів на одну пошту — не більше ліміту за годину', async () => {
    const email = freshEmail()
    for (let i = 0; i < SEND_PER_HOUR; i++) {
      expect(await consumeEmailBudget('send', email)).toBe(true)
    }
    expect(await consumeEmailBudget('send', email)).toBe(false)
  })

  it('перевірок коду для однієї пошти — не більше ліміту за годину', async () => {
    const email = freshEmail()
    for (let i = 0; i < VERIFY_PER_HOUR; i++) {
      expect(await consumeEmailBudget('verify', email)).toBe(true)
    }
    expect(await consumeEmailBudget('verify', email)).toBe(false)
  })

  it('листи й перевірки рахуються окремо, різні пошти — окремо', async () => {
    const email = freshEmail()
    for (let i = 0; i < SEND_PER_HOUR; i++) await consumeEmailBudget('send', email)

    expect(await consumeEmailBudget('send', email)).toBe(false)
    expect(await consumeEmailBudget('verify', email)).toBe(true)
    expect(await consumeEmailBudget('send', freshEmail())).toBe(true)
  })

  // Сенс усього замка: скільки б IP не мав нападник, спроб на добу — жменя.
  // Шестизначний код — мільйон варіантів.
  it('добовий бюджет лишає підбору коду мізерний шанс', () => {
    expect(VERIFY_PER_DAY).toBeLessThanOrEqual(50)
    expect(VERIFY_PER_DAY / 1_000_000).toBeLessThan(0.0001)
    // Нових кодів теж небагато — поштову скриньку не засипати.
    expect(SEND_PER_DAY).toBeLessThanOrEqual(30)
    expect(SEND_PER_HOUR).toBeLessThan(SEND_PER_DAY)
    expect(VERIFY_PER_HOUR).toBeLessThan(VERIFY_PER_DAY)
  })

  it('добова стеля діє й тоді, коли годинні вікна щоразу нові', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const start = new Date('2026-11-10T00:00:00Z').getTime()
      const email = freshEmail()
      let passed = 0
      // Щогодини — повний годинний бюджет, 23 години поспіль.
      for (let hour = 0; hour < 23; hour++) {
        vi.setSystemTime(start + hour * 61 * 60_000)
        for (let i = 0; i < VERIFY_PER_HOUR; i++) {
          if (await consumeEmailBudget('verify', email)) passed++
        }
      }
      expect(passed).toBe(VERIFY_PER_DAY)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('які шляхи під замком', () => {
  it('усе, що шле лист на пошту з тіла', () => {
    for (const path of [
      '/registration/start',
      '/registration/resend',
      '/email-otp/send-verification-otp',
      '/email-otp/request-password-reset',
      '/request-password-reset',
    ]) {
      expect(SEND_PATHS).toContain(path)
    }
  })

  it('усе, що перевіряє код', () => {
    for (const path of [
      '/registration/verify',
      '/email-otp/verify-email',
      '/email-otp/check-verification-otp',
      '/email-otp/reset-password',
    ]) {
      expect(VERIFY_PATHS).toContain(path)
    }
  })

  // Вхід паролем сюди не входить навмисно: блокування за поштою дало б
  // будь-кому спосіб закрити людині вхід.
  it('вхід паролем не блокується за поштою', () => {
    expect(SEND_PATHS).not.toContain('/sign-in/email')
    expect(VERIFY_PATHS).not.toContain('/sign-in/email')
  })
})

describe('плагін better-auth', () => {
  const plugin = authGuard()
  const [send, verify] = plugin.hooks.before

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (path: string, body: unknown = {}) => ({ path, body }) as any

  it('матчери ловлять свої шляхи й не чіпають решту', () => {
    expect(send.matcher(ctx('/registration/start'))).toBe(true)
    expect(send.matcher(ctx('/email-otp/verify-email'))).toBe(false)
    expect(verify.matcher(ctx('/email-otp/reset-password'))).toBe(true)
    expect(verify.matcher(ctx('/registration/start'))).toBe(false)

    for (const path of ['/sign-in/email', '/get-session', '/sign-out', undefined]) {
      expect(send.matcher(ctx(path as string))).toBe(false)
      expect(verify.matcher(ctx(path as string))).toBe(false)
    }
  })

  /** Статус відмови обробника або null, якщо пропустив. */
  async function statusOf(run: () => unknown): Promise<number | null> {
    try {
      await run()
      return null
    } catch (err) {
      return (err as { statusCode?: number }).statusCode ?? -1
    }
  }

  it('понад бюджет перевірок — 429, а не перевірка коду', async () => {
    const email = freshEmail()
    const call = () =>
      statusOf(() => verify.handler(ctx('/email-otp/reset-password', { email, otp: '000000' })))

    for (let i = 0; i < VERIFY_PER_HOUR; i++) expect(await call()).toBeNull()
    expect(await call()).toBe(429)
  })

  // Бюджет спільний на всі шляхи: інакше він множився б на їх кількість.
  it('різні шляхи перевірки ділять один бюджет', async () => {
    const email = freshEmail()
    const paths = [...VERIFY_PATHS]
    for (let i = 0; i < VERIFY_PER_HOUR; i++) {
      await verify.handler(ctx(paths[i % paths.length], { email }))
    }
    for (const path of paths) {
      expect(await statusOf(() => verify.handler(ctx(path, { email })))).toBe(429)
    }
  })

  // better-auth порівнює пошту без регістру — і ми рахуємо так само.
  it('регістр і пробіли в пошті бюджет не обходять', async () => {
    const email = freshEmail()
    for (let i = 0; i < SEND_PER_HOUR; i++) {
      await send.handler(ctx('/registration/resend', { email }))
    }
    for (const variant of [email.toUpperCase(), `  ${email}  `]) {
      expect(
        await statusOf(() => send.handler(ctx('/registration/resend', { email: variant }))),
      ).toBe(429)
    }
  })

  it('без пошти в тілі обробник не падає й нічого не рахує', async () => {
    for (const body of [{}, null, undefined, { email: 42 }, { email: '' }, { email: 'a'.repeat(300) }]) {
      for (let i = 0; i < VERIFY_PER_HOUR + 2; i++) {
        expect(await statusOf(() => verify.handler(ctx('/registration/verify', body)))).toBeNull()
      }
    }
  })
})

describe('закриті шляхи better-auth', () => {
  // Кожен із них колись був способом обійти наші правила — список у
  // auth-guard.ts із причинами. Тест падає, якщо шлях тихо повернули.
  it('вхід за кодом, стара реєстрація й «змінити фото» закриті', () => {
    for (const path of [
      '/sign-up/email',
      '/sign-in/email-otp',
      '/forget-password/email-otp',
      '/update-user',
    ]) {
      expect(DISABLED_AUTH_PATHS).toContain(path)
    }
  })

  // Закрите не має бути тим, чим користуються сайт і застосунок.
  it('робочі шляхи не закриті', () => {
    for (const path of [
      '/sign-in/email',
      '/sign-in/social',
      '/sign-out',
      '/get-session',
      '/change-password',
      '/request-password-reset',
      '/reset-password',
      '/email-otp/send-verification-otp',
      '/email-otp/verify-email',
      '/email-otp/check-verification-otp',
      '/email-otp/request-password-reset',
      '/email-otp/reset-password',
      '/registration/start',
      '/registration/resend',
      '/registration/verify',
    ]) {
      expect(DISABLED_AUTH_PATHS).not.toContain(path)
    }
  })
})

describe('заблокований не отримує нової сесії', () => {
  const account = (patch: Record<string, unknown> = {}) => ({
    id: 'u1',
    role: 'CLIENT',
    banned: false,
    emailVerified: true,
    onboarded: true,
    ...patch,
  })

  it('звичайний акаунт — сесія створюється', async () => {
    prisma.user.findUnique.mockResolvedValue(account())
    expect(await refuseBannedSession({ userId: 'u1' })).toBeUndefined()
  })

  // false — саме те значення, за яким better-auth не створює сесію.
  it('забанений (і видалений — це теж бан) — false', async () => {
    prisma.user.findUnique.mockResolvedValue(account({ banned: true }))
    expect(await refuseBannedSession({ userId: 'u1' })).toBe(false)
  })

  it('стан береться з бази за id із сесії', async () => {
    prisma.user.findUnique.mockResolvedValue(account({ id: 'u7' }))
    await refuseBannedSession({ userId: 'u7' })
    expect(prisma.user.findUnique.mock.calls[0][0].where).toEqual({ id: 'u7' })
  })

  // Сесія може створюватись у тій самій транзакції, що й щойно
  // зареєстрований користувач: окреме зʼєднання його ще не бачить. Це не
  // привід відмовити — і не привід запамʼятати «користувача немає» в кеші
  // стану акаунта, звідки новачка потім гнали б на вхід.
  it('користувача ще не видно в базі — сесія створюється, кеш не чіпаємо', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    expect(await refuseBannedSession({ userId: 'new-user' })).toBeUndefined()

    // Наступне читання стану акаунта йде в базу, а не бере «немає» з кешу.
    const { getAccountState } = await import('$lib/server/account-cache')
    prisma.user.findUnique.mockResolvedValue(account({ id: 'new-user' }))
    expect(await getAccountState('new-user')).toEqual(account({ id: 'new-user' }))
  })
})
