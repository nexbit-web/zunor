import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetPrisma } from './helpers/prisma-mock'
import { makeEvent, sessionUser } from './helpers/event'

// Замок №2 адмінки: КОЖЕН load і КОЖНА дія під src/routes/admin самі
// перевіряють, що перед ними співробітник (requireStaff). Замок №1 у
// hooks тримає те саме ще до них — але якщо він колись протече, тримати
// мусить цей.
//
// Маршрути збираються з диска (import.meta.glob), а не списком: нова
// сторінка адмінки без перевірки впаде тут сама, її не треба згадувати.

type Role = 'CLIENT' | 'MASTER' | 'ADMIN' | 'MANAGER' | 'MODERATOR'
const states: Record<string, { id: string; role: Role; banned: boolean } | undefined> = {}

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('./helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/account-cache', () => ({
  getAccountState: vi.fn(async (id: string) =>
    states[id] ? { emailVerified: true, onboarded: true, ...states[id] } : null,
  ),
  invalidateAccount: vi.fn(async () => {}),
}))
vi.mock('$lib/server/dispatch', async () => await import('./helpers/infra'))
vi.mock('$lib/server/pusher', async () => await import('./helpers/infra'))
vi.mock('$lib/server/notifications', async () => await import('./helpers/infra'))
vi.mock('$lib/server/cloudinary', async () => await import('./helpers/infra'))
vi.mock('$lib/server/sessions', () => ({ revokeSessions: vi.fn(async () => {}) }))
vi.mock('$lib/server/telegram', () => ({ sendTelegramText: vi.fn(async () => {}) }))

const { markVerified, clearStepUp } = await import('$lib/server/admin/step-up')

interface RouteModule {
  load?: (event: unknown) => unknown
  actions?: Record<string, (event: unknown) => unknown>
}

const modules = import.meta.glob<RouteModule>([
  '../routes/admin/**/+page.server.ts',
  '../routes/admin/**/+layout.server.ts',
])

/** Статус відмови: кинутий error() або fail() із форми-обгортки. */
async function denial(run: () => unknown): Promise<number | null> {
  try {
    const out = (await run()) as { status?: number } | undefined
    // asForm перетворює кинуту помилку на fail() — це теж відмова.
    if (out && typeof out === 'object' && 'status' in out && typeof out.status === 'number') {
      return out.status
    }
    return null
  } catch (err) {
    const e = err as { status?: number; location?: string }
    if (typeof e?.status === 'number' && !e.location) return e.status
    if (typeof e?.status === 'number' && e.location) return e.status // redirect
    throw err
  }
}

function locals(id: string) {
  const base = sessionUser(id)
  // Справжня форма locals.session — { session, user } (better-auth).
  return { ...base, session: { session: { id: `sess-${id}` }, user: base.user } }
}

function eventFor(id: string) {
  return makeEvent({
    url: '/admin/x',
    method: 'POST',
    form: { code: '000000', reason: 'причина', email: 'x@x.x', role: 'ADMIN', userId: 'u9' },
    params: { id: 'target' },
    locals: locals(id),
  })
}

async function everyEntry(
  id: string,
  check: (name: string, status: number | null) => void,
  skip: (path: string) => boolean = () => false,
) {
  for (const [path, importer] of Object.entries(modules)) {
    if (skip(path)) continue
    const mod = await importer()
    if (mod.load) check(`${path} load`, await denial(() => mod.load!(eventFor(id))))
    for (const [name, action] of Object.entries(mod.actions ?? {})) {
      check(`${path} ?/${name}`, await denial(() => action(eventFor(id))))
    }
  }
}

beforeEach(() => {
  resetPrisma()
  clearStepUp()
  for (const k of Object.keys(states)) delete states[k]
  states.client = { id: 'client', role: 'CLIENT', banned: false }
  states.master = { id: 'master', role: 'MASTER', banned: false }
  states.admin = { id: 'admin', role: 'ADMIN', banned: false }
  states.bannedAdmin = { id: 'bannedAdmin', role: 'ADMIN', banned: true }
  states.moder = { id: 'moder', role: 'MODERATOR', banned: false }
})

describe('кожен маршрут адмінки перевіряє співробітника сам', () => {
  it('маршрути знайдено', () => {
    expect(Object.keys(modules).length).toBeGreaterThan(5)
  })

  it('гість — 404 скрізь', async () => {
    await everyEntry('nobody', (name, status) => expect(status, name).toBe(404))
  })

  it('клієнт і майстер — 404 скрізь', async () => {
    for (const id of ['client', 'master']) {
      await everyEntry(id, (name, status) => expect(status, name).toBe(404))
    }
  })

  it('забанений адміністратор — 404 скрізь', async () => {
    await everyEntry('bannedAdmin', (name, status) => expect(status, name).toBe(404))
  })

  it('адміністратор без коду другого фактора — 404 скрізь, крім сторінки коду й лейаута', async () => {
    await everyEntry(
      'admin',
      (name, status) => expect(status, name).toBe(404),
      (path) => path.includes('/2fa/') || path.endsWith('admin/+layout.server.ts'),
    )
  })

  it('модератор із кодом не бачить співробітників, журналу й списку користувачів', async () => {
    markVerified('sess-moder')
    for (const page of ['staff', 'log', 'users/+page']) {
      const entry = Object.entries(modules).find(([p]) => p.includes(`/admin/${page}`))
      expect(entry, page).toBeDefined()
      const mod = await entry![1]()
      expect(await denial(() => mod.load!(eventFor('moder'))), page).toBe(404)
    }
  })
})
