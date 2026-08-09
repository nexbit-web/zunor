import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from './helpers/prisma-mock'
import { makeEvent } from './helpers/event'
import type { RequestEvent } from '@sveltejs/kit'

const getSession = vi.fn()

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('./helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/auth', () => ({ auth: { api: { getSession } } }))
// better-auth сам обробляє /api/auth/* — у тестах він має просто пропускати
// запит далі, інакше ми тестували б чужу бібліотеку, а не свої замки.
vi.mock('better-auth/svelte-kit', () => ({
  svelteKitHandler: async ({
    event,
    resolve,
  }: {
    event: RequestEvent
    resolve: (e: RequestEvent) => Promise<Response>
  }) => resolve(event),
}))

// Справжній sequence() лізе у внутрішнє сховище запиту SvelteKit, якого поза
// живим сервером не існує. Підміняємо еквівалентною композицією: кожен
// наступний handle стає resolve для попереднього — саме та семантика, на якій
// тримається порядок замків. Тестуємо свій ланцюжок, а не чужу бібліотеку.
vi.mock('@sveltejs/kit/hooks', () => ({
  sequence:
    (...handlers: Handle[]) =>
    ({ event, resolve }: { event: RequestEvent; resolve: Resolve }) => {
      const next =
        (i: number): Resolve =>
        (ev) =>
          i === handlers.length
            ? resolve(ev)
            : (handlers[i]({ event: ev, resolve: next(i + 1) }) as
                | Response
                | Promise<Response>)
      return next(0)(event)
    },
}))

type Resolve = (event: RequestEvent) => Response | Promise<Response>
type Handle = (input: {
  event: RequestEvent
  resolve: Resolve
}) => Response | Promise<Response>

const { handle } = await import('../hooks.server')
const { clearAccountCache } = await import('$lib/server/account-cache')

// hooks.server.ts — це шлагбаум перед УСІМА сторінками. Порядок замків тут
// критичний (бан → пошта → онбординг), і жоден load() його не дублює: якщо
// замок протече тут, він протече скрізь одразу.

/** Стан акаунта у вигляді, який читає getAccountState. */
function account(patch: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    role: 'CLIENT',
    banned: false,
    emailVerified: true,
    onboarded: true,
    ...patch,
  }
}

const resolve = vi.fn(
  async (_event: RequestEvent) => new Response('ok', { status: 200 }),
)

/** Проганяє повний ланцюжок hooks для заданого шляху. */
async function run(pathname: string, loggedIn = true): Promise<Response> {
  getSession.mockResolvedValue(loggedIn ? { user: { id: 'u1' } } : null)
  const event = makeEvent({ url: pathname, method: 'GET' })
  return (await handle({
    event,
    resolve,
  } as unknown as Parameters<typeof handle>[0])) as Response
}

/** Те саме, але очікує редірект (він кидається, а не повертається). */
async function redirectOf(
  pathname: string,
  loggedIn = true,
): Promise<{ status: number; location: string }> {
  try {
    await run(pathname, loggedIn)
  } catch (err) {
    const e = err as { status?: number; location?: string }
    if (typeof e?.status === 'number' && typeof e.location === 'string') {
      return { status: e.status, location: e.location }
    }
    throw err
  }
  throw new Error(`Очікувався редірект із ${pathname}, але його не було`)
}

beforeEach(() => {
  resetPrisma()
  clearAccountCache()
  resolve.mockClear()
  getSession.mockReset()
  prisma.user.findUnique.mockResolvedValue(account())
  prisma.session.deleteMany.mockResolvedValue({ count: 1 })
})

describe('гість', () => {
  it('на дашборд не потрапляє — редірект на логін із поверненням', async () => {
    const r = await redirectOf('/dashboard/orders', false)

    expect(r.status).toBe(303)
    expect(r.location).toContain('/user/login')
    expect(r.location).toContain(encodeURIComponent('/dashboard/orders'))
  })

  it('публічні сторінки відкриті', async () => {
    for (const path of ['/', '/privacy', '/terms', '/@ivan']) {
      const res = await run(path, false)
      expect(res.status).toBe(200)
    }
  })

  // API захищає себе сам: fetch-клієнту потрібен 401, а не 302 на HTML.
  it('API не редіректить гостя', async () => {
    const res = await run('/api/jobs/feed', false)
    expect(res.status).toBe(200)
    expect(resolve).toHaveBeenCalled()
  })
})

describe('замок 1: бан', () => {
  it('забанений вилітає на логін і його сесії знищуються', async () => {
    prisma.user.findUnique.mockResolvedValue(account({ banned: true }))

    const r = await redirectOf('/dashboard')

    expect(r.location).toBe('/user/login?error=banned')
    // Видалення сесій із БД — щоб доступ зник і після протухання cookie-кешу.
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    })
  })

  // Бан має бити раніше за все інше: інакше забанений із непідтвердженою
  // поштою пішов би не на логін, а на сторінку верифікації.
  it('бан перебиває непідтверджену пошту', async () => {
    prisma.user.findUnique.mockResolvedValue(
      account({ banned: true, emailVerified: false }),
    )

    const r = await redirectOf('/dashboard')
    expect(r.location).toContain('error=banned')
  })
})

describe('замок 2: підтвердження пошти', () => {
  it('без підтвердженої пошти дашборд закритий', async () => {
    prisma.user.findUnique.mockResolvedValue(account({ emailVerified: false }))

    const r = await redirectOf('/dashboard/orders')
    expect(r.location).toBe('/user/verify-email')
  })

  it('сама сторінка верифікації лишається доступною', async () => {
    prisma.user.findUnique.mockResolvedValue(account({ emailVerified: false }))

    const res = await run('/user/verify-email')
    expect(res.status).toBe(200)
  })

  it('підтвердженому на сторінці верифікації робити нічого', async () => {
    const r = await redirectOf('/user/verify-email')
    expect(r.location).toBe('/dashboard')
  })
})

describe('замок 3: онбординг', () => {
  it('без онбордингу дашборд замкнений на форму', async () => {
    prisma.user.findUnique.mockResolvedValue(account({ onboarded: false }))

    const r = await redirectOf('/dashboard/orders')
    expect(r.location).toBe('/dashboard/onboarding')
  })

  it('сама форма онбордингу доступна', async () => {
    prisma.user.findUnique.mockResolvedValue(account({ onboarded: false }))

    const res = await run('/dashboard/onboarding')
    expect(res.status).toBe(200)
  })

  it('після онбордингу екран вибору ролі закритий', async () => {
    const r = await redirectOf('/dashboard/onboarding')
    expect(r.location).toBe('/dashboard/profile')
  })

  // Точне порівняння, а не startsWith: дочірній /onboarding/master —
  // це апгрейд ролі, він має лишатись відкритим онбордженому клієнту.
  it('апгрейд ролі /onboarding/master лишається доступним', async () => {
    const res = await run('/dashboard/onboarding/master')
    expect(res.status).toBe(200)
  })
})

describe('залогінений на гостьових сторінках', () => {
  it('логін і реєстрація перекидають на дашборд', async () => {
    for (const path of ['/user/login', '/user/register']) {
      expect((await redirectOf(path)).location).toBe('/dashboard')
    }
  })

  it('лендінг перекидає на дашборд', async () => {
    expect((await redirectOf('/')).location).toBe('/dashboard')
  })

  // Скидання пароля навмисно НЕ guest-only: людина може бути залогінена
  // й міняти пароль за листом.
  it('скидання пароля доступне залогіненому', async () => {
    const res = await run('/user/reset-password')
    expect(res.status).toBe(200)
  })

  it('публічний профіль майстра лишається відкритим', async () => {
    const res = await run('/@ivan')
    expect(res.status).toBe(200)
  })
})

describe('видалений акаунт із живою сесією', () => {
  it('відправляється на логін, а не отримує 500', async () => {
    prisma.user.findUnique.mockResolvedValue(null)

    const r = await redirectOf('/dashboard')
    expect(r.location).toBe('/user/login')
  })
})

describe('locals.account передається далі', () => {
  // Щоб load-функції не робили той самий SELECT удруге.
  it('роль і прапорці кладуться в locals для сторінок дашборда', async () => {
    prisma.user.findUnique.mockResolvedValue(account({ role: 'MASTER' }))

    await run('/dashboard/proposals')

    const event = resolve.mock.calls[0][0] as unknown as RequestEvent
    expect(event.locals.account).toEqual({
      id: 'u1',
      role: 'MASTER',
      onboarded: true,
      emailVerified: true,
    })
  })

  it('стан акаунта читається з БД один раз на кілька навігацій (кеш)', async () => {
    await run('/dashboard')
    await run('/dashboard/orders')
    await run('/dashboard/profile')

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1)
  })
})

describe('заголовки безпеки', () => {
  it('CSP і решта заголовків стоять на кожній відповіді', async () => {
    const res = await run('/', false)

    const csp = res.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    // Картинки — лише свої й Cloudinary: інакше будь-яке чуже посилання
    // в профілі стає трекінг-пікселем.
    expect(csp).toContain('img-src')
    expect(csp).not.toContain('img-src *')

    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin',
    )
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=')
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
    expect(res.headers.get('Permissions-Policy')).toContain('camera=()')
  })

  // Після logout браузер не має права дістати сторінку дашборда з диска.
  it('сторінки дашборда не кешуються', async () => {
    const res = await run('/dashboard')
    expect(res.headers.get('Cache-Control')).toBe('no-store, must-revalidate')
  })

  it('публічні сторінки такого заборонного кешу не мають', async () => {
    const res = await run('/', false)
    expect(res.headers.get('Cache-Control')).not.toBe(
      'no-store, must-revalidate',
    )
  })
})

describe('стійкість авторизації', () => {
  // Збій auth-шару має означати «аноним», а не 500 на весь сайт.
  it('падіння getSession не ронить публічну сторінку', async () => {
    getSession.mockRejectedValue(new Error('auth db down'))

    const event = makeEvent({ url: '/', method: 'GET' })
    const res = (await handle({
      event,
      resolve,
    } as unknown as Parameters<typeof handle>[0])) as Response

    expect(res.status).toBe(200)
    expect(event.locals.user).toBeNull()
  })
})
