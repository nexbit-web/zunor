import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { makeEvent, sessionUser, anonymous } from '../helpers/event'

const loadProfileData = vi.fn(async (_userId: string) => ({ prefill: {} }))

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/profile', () => ({ loadProfileData }))
// Барель $lib/components/settings реекспортує .svelte-компоненти, а конфіг
// тестів навмисно без плагіна sveltekit. Лоадеру звідти потрібна лише одна
// константа — її й підміняємо, замість того щоб тягнути в тести весь UI.
vi.mock('$lib/components/settings', () => ({ DEFAULT_SECTION: 'profile' }))

const rootLayout = await import('../../routes/+layout.server')
const authLayout = await import('../../routes/(auth)/+layout.server')
const dashboardLayout =
  await import('../../routes/(auth)/dashboard/+layout.server')
const rootPage = await import('../../routes/+page.server')
const settingsIndex =
  await import('../../routes/(auth)/dashboard/settings/+page.server')
const settingsProfile =
  await import('../../routes/(auth)/dashboard/settings/profile/+page.server')
const settingsSecurity =
  await import('../../routes/(auth)/dashboard/settings/security/+page.server')
const profilePage =
  await import('../../routes/(auth)/dashboard/profile/+page.server')
const onboardingIndex =
  await import('../../routes/(auth)/dashboard/onboarding/+page.server')
const onboardingClient =
  await import('../../routes/(auth)/dashboard/onboarding/client/+page.server')
const onboardingMaster =
  await import('../../routes/(auth)/dashboard/onboarding/master/+page.server')
const jobsNew =
  await import('../../routes/(auth)/dashboard/jobs/new/+page.server')
const analytics =
  await import('../../routes/(auth)/dashboard/analytics/+page.server')
const verifyEmail =
  await import('../../routes/(auth)/user/verify-email/+page.server')

// Гарди сторінок. Замки в hooks.server.ts вирішують «пускати на /dashboard
// узагалі», а ці лоадери — «пускати на КОНКРЕТНУ сторінку». Помилка тут
// колись уже коштувала того, що сторінка майстра тихо показувалась клієнту.
//
// Друга річ, яку тут стережемо, — кількість запитів до бази. Ці лоадери
// виконуються на кожній навігації, а Neon тарифікує час роботи бази: зайвий
// SELECT тут коштує грошей навіть при нульовому трафіку.

/** Ловить кинутий redirect() і повертає { status, location }. */
async function redirectOf(
  run: () => unknown,
): Promise<{ status: number; location: string }> {
  try {
    await run()
  } catch (err) {
    const e = err as { status?: number; location?: string }
    if (typeof e?.location === 'string') {
      return { status: e.status ?? 0, location: e.location }
    }
    throw err
  }
  throw new Error('Очікувався редірект, але його не було')
}

/** locals з готовим account — так їх бачить сторінка під /dashboard. */
function withAccount(
  userId: string,
  account: Record<string, unknown> | null,
): Record<string, unknown> {
  return { ...sessionUser(userId), account }
}

beforeEach(() => {
  resetPrisma()
  loadProfileData.mockClear()
})

describe('кореневий лейаут', () => {
  // Виконується на КОЖНІЙ навігації — і на публічних сторінках теж.
  // Жодного запиту до бази тут бути не повинно.
  it('віддає лише сесію, у базу не ходить', async () => {
    const data = await rootLayout.load(makeEvent({ locals: sessionUser('u1') }))

    expect(data).toHaveProperty('session')
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(prisma.notification.count).not.toHaveBeenCalled()
  })

  it('гостю віддає порожню сесію без падіння', async () => {
    const data = (await rootLayout.load(makeEvent({ locals: anonymous }))) as {
      session: unknown
    }
    expect(data.session).toBeNull()
  })
})

describe('лейаут (auth)', () => {
  it('гість — роль null, у базу не ходимо', async () => {
    const data = (await authLayout.load(makeEvent({ locals: anonymous }))) as {
      role: string | null
    }

    expect(data.role).toBeNull()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  // guardHandle уже прочитав роль з БД і поклав у locals.account —
  // другий SELECT за ту саму колонку на кожній навігації дашборда.
  it('бере роль із locals.account, не роблячи зайвий запит', async () => {
    const data = (await authLayout.load(
      makeEvent({ locals: withAccount('u1', { role: 'MASTER' }) }),
    )) as { role: string }

    expect(data.role).toBe('MASTER')
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  // Поза /dashboard/** account не заповнюється — тоді фолбек на БД.
  it('без account питає базу — роль не можна брати із сесії', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'CLIENT' })

    const data = (await authLayout.load(
      makeEvent({ locals: sessionUser('u1') }),
    )) as { role: string }

    expect(data.role).toBe('CLIENT')
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1)
  })
})

// Cookie читає сервер ДО рендеру — інакше панель мигнула б у дефолтній
// ширині й перескочила у збережену після гідратації. Пише її сам
// Sidebar.Provider з shadcn, тож ім'я й формат («true»/«false»)
// диктує він, а не ми.
describe('лейаут дашборда', () => {
  it('стан панелі читається з cookie до рендеру', async () => {
    const event = makeEvent({ locals: sessionUser('u1') })

    const open = (await dashboardLayout.load({
      ...event,
      cookies: { ...event.cookies, get: () => 'true' },
    })) as { sidebarOpen: boolean }
    expect(open.sidebarOpen).toBe(true)
  })

  it('дефолт — згорнута панель, а не розгорнута', async () => {
    const event = makeEvent({ locals: sessionUser('u1') })

    const def = (await dashboardLayout.load(event)) as { sidebarOpen: boolean }
    expect(def.sidebarOpen).toBe(false)
  })

  // Будь-яке чуже значення в cookie має читатись як «згорнуто», а не
  // валити лейаут: cookie редагується з DevTools одним рухом.
  it('сміття в cookie не ламає лейаут', async () => {
    const event = makeEvent({ locals: sessionUser('u1') })

    for (const raw of ['', 'yes', '1', 'undefined']) {
      const data = (await dashboardLayout.load({
        ...event,
        cookies: { ...event.cookies, get: () => raw },
      })) as { sidebarOpen: boolean }
      expect(data.sidebarOpen, raw).toBe(false)
    }
  })
})

describe('головна сторінка', () => {
  it('гість бачить лендінг без запиту в базу', async () => {
    await rootPage.load(makeEvent({ locals: anonymous }))
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  // Майстер працює зі стрічкою — це його дім, а не клієнтський лендінг.
  it('майстра розвертає на стрічку заявок', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'MASTER' })

    const r = await redirectOf(() =>
      rootPage.load(makeEvent({ locals: sessionUser('m1') })),
    )
    expect(r.location).toBe('/dashboard/jobs')
  })

  it('клієнта не розвертає', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'CLIENT' })
    await expect(
      rootPage.load(makeEvent({ locals: sessionUser('c1') })),
    ).resolves.toBeDefined()
  })
})

describe('гарди за роллю', () => {
  // Створення заявки — інструмент замовника. Перевірка на сервері, а не
  // приховування кнопки: майстер може відкрити URL напряму.
  it('майстра не пускає на створення заявки', async () => {
    const r = await redirectOf(() =>
      jobsNew.load(
        makeEvent({ locals: withAccount('m1', { id: 'm1', role: 'MASTER' }) }),
      ),
    )
    expect(r.location).toBe('/dashboard')
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('клієнта пускає на створення заявки', async () => {
    prisma.user.findUnique.mockResolvedValue({ city: 'odesa' })

    const data = (await jobsNew.load(
      makeEvent({ locals: withAccount('c1', { id: 'c1', role: 'CLIENT' }) }),
    )) as { userCity: string }

    expect(data.userCity).toBe('odesa')
  })

  it('гостя зі сторінки створення веде на логін із поверненням', async () => {
    const r = await redirectOf(() =>
      jobsNew.load(makeEvent({ locals: anonymous })),
    )
    expect(r.location).toContain('/user/login')
    expect(r.location).toContain(encodeURIComponent('/dashboard/jobs/new'))
  })

  // Аналітика — сторінка майстра. Саме на такій сторінці колись і зламалось:
  // клієнт бачив порожню сторінку замість редіректу.
  it('клієнта не пускає в аналітику', async () => {
    const r = await redirectOf(() =>
      analytics.load(
        makeEvent({ locals: withAccount('c1', { id: 'c1', role: 'CLIENT' }) }),
      ),
    )
    expect(r.location).toBe('/dashboard')
  })

  it('гарду достатньо ролі з locals.account — зайвого SELECT немає', async () => {
    await redirectOf(() =>
      analytics.load(
        makeEvent({ locals: withAccount('c1', { id: 'c1', role: 'CLIENT' }) }),
      ),
    )
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })
})

describe('онбординг', () => {
  it('онбордженого не пускає назад до вибору ролі', async () => {
    const r = await redirectOf(() =>
      onboardingIndex.load(
        makeEvent({
          locals: withAccount('u1', { onboarded: true, role: 'CLIENT' }),
        }),
      ),
    )
    expect(r.location).toBe('/dashboard/profile')
  })

  it('новачка на вибір ролі пускає', async () => {
    // Лоадер тут синхронний — редіректу немає, повертається порожній обʼєкт.
    const data = await onboardingIndex.load(
      makeEvent({
        locals: withAccount('u1', { onboarded: false, role: 'CLIENT' }),
      }),
    )
    expect(data).toBeDefined()
  })

  it('онбордженого не пускає на клієнтську форму онбордингу', async () => {
    const r = await redirectOf(() =>
      onboardingClient.load(
        makeEvent({
          locals: withAccount('u1', { onboarded: true, role: 'CLIENT' }),
        }),
      ),
    )
    expect(r.location).toBe('/dashboard/profile')
    expect(loadProfileData).not.toHaveBeenCalled()
  })

  // Ключове місце: для онбордженого КЛІЄНТА ця сторінка — єдиний шлях
  // стати майстром. Перевірка лише на onboarded колись розвертала його
  // назад, і апгрейд ролі був недосяжний.
  it('онбордженого клієнта пускає на апгрейд до майстра', async () => {
    await expect(
      onboardingMaster.load(
        makeEvent({
          locals: withAccount('c1', { onboarded: true, role: 'CLIENT' }),
        }),
      ),
    ).resolves.toBeDefined()
    expect(loadProfileData).toHaveBeenCalledWith('c1')
  })

  it('онбордженого майстра з цієї сторінки розвертає', async () => {
    const r = await redirectOf(() =>
      onboardingMaster.load(
        makeEvent({
          locals: withAccount('m1', { onboarded: true, role: 'MASTER' }),
        }),
      ),
    )
    expect(r.location).toBe('/dashboard/profile')
  })

  it('гостя з форм онбордингу веде на логін', async () => {
    for (const page of [onboardingClient, onboardingMaster]) {
      const r = await redirectOf(() =>
        page.load(makeEvent({ locals: anonymous })),
      )
      expect(r.location).toContain('/user/login')
    }
  })
})

describe('профіль і налаштування', () => {
  it('без онбордингу профіль замкнений на форму', async () => {
    const r = await redirectOf(() =>
      profilePage.load(
        makeEvent({
          locals: withAccount('u1', { onboarded: false, role: 'CLIENT' }),
        }),
      ),
    )
    expect(r.location).toBe('/dashboard/onboarding')
    expect(loadProfileData).not.toHaveBeenCalled()
  })

  it('онбордженому профіль відкритий', async () => {
    await profilePage.load(
      makeEvent({
        locals: withAccount('u1', { onboarded: true, role: 'CLIENT' }),
      }),
    )
    expect(loadProfileData).toHaveBeenCalledWith('u1')
  })

  it('голий /settings веде на перший розділ', async () => {
    const r = await redirectOf(() => settingsIndex.load(makeEvent({})))
    expect(r.status).toBe(307)
    expect(r.location).toContain('/dashboard/settings/')
  })

  it('налаштування профілю теж вимагають онбордингу', async () => {
    const r = await redirectOf(() =>
      settingsProfile.load(
        makeEvent({
          locals: withAccount('u1', { onboarded: false, role: 'CLIENT' }),
        }),
      ),
    )
    expect(r.location).toBe('/dashboard/onboarding')
  })

  it('гостя з налаштувань безпеки веде на логін із поверненням', async () => {
    const r = await redirectOf(() =>
      settingsSecurity.load(makeEvent({ locals: anonymous })),
    )
    expect(r.location).toContain('/user/login')
    expect(r.location).toContain(
      encodeURIComponent('/dashboard/settings/security'),
    )
  })
})

describe('сторінка підтвердження пошти', () => {
  it('пошта з сесії має пріоритет над query', async () => {
    const data = (await verifyEmail.load(
      makeEvent({
        url: '/user/verify-email?email=attacker@evil.com',
        locals: sessionUser('u1'),
      }),
    )) as { email: string }

    expect(data.email).toBe('u1@example.com')
  })

  it('без сесії бере пошту з query, якщо вона схожа на пошту', async () => {
    const data = (await verifyEmail.load(
      makeEvent({
        url: '/user/verify-email?email=Someone%40Example.com',
        locals: anonymous,
      }),
    )) as { email: string }

    expect(data.email).toBe('someone@example.com')
  })

  // Значення потрапляє на сторінку — сміття в ньому бути не має.
  it('сміття в query відкидається, веде на реєстрацію', async () => {
    for (const raw of ['', 'не пошта', '<script>', 'a@'.repeat(200)]) {
      const r = await redirectOf(() =>
        verifyEmail.load(
          makeEvent({
            url: `/user/verify-email?email=${encodeURIComponent(raw)}`,
            locals: anonymous,
          }),
        ),
      )
      expect(r.location).toBe('/user/register')
    }
  })
})
