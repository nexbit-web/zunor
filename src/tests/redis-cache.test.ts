import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { env } from '$env/dynamic/private'
import { prisma, resetPrisma } from './helpers/prisma-mock'
import {
  fakeRedis,
  store,
  ttls,
  breakRedis,
  resetRedis,
} from './helpers/redis-fake'

vi.mock(
  '@upstash/redis',
  async () => (await import('./helpers/redis-fake')).upstashModule,
)
vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('./helpers/prisma-mock')).prisma,
}))

// Redis увімкнено лише в цьому файлі: модулі читають змінні при імпорті.
env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io'
env.UPSTASH_REDIS_REST_TOKEN = 'test-token'

const { resetRedisFuse } = await import('$lib/server/redis')
const { cached, forget } = await import('$lib/server/cache')
const { authStorage } = await import('$lib/server/auth-storage')
const { touchPresence, lastSeenMany, freshest } =
  await import('$lib/server/presence')
const { getAccountState, invalidateAccount, clearAccountCache } =
  await import('$lib/server/account-cache')
const { isChatMember } = await import('$lib/server/chat-members')
const { loadMasterPage, forgetMasterPage } =
  await import('$lib/server/master-page')
const { getDistricts, invalidateReference } =
  await import('$lib/server/reference')

// Redis стоїть перед Neon, щоб база не прокидалась на кожен запит. Тести
// тримають дві обіцянки: (1) кеш справді знімає запити з бази, (2) він
// ніколи не ламає застосунок — збій Redis означає лише похід у базу, а
// відкликання сесії мовчки не губиться.

/** Дочекатися записів у Redis, які кеш робить у фоні. */
const settle = () => new Promise((resolve) => setImmediate(resolve))

beforeEach(() => {
  resetPrisma()
  resetRedis()
  resetRedisFuse()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('cached: спершу Redis, потім база', () => {
  it('промах — база, і відповідь лягає в Redis під префіксом із TTL', async () => {
    const load = vi.fn(async () => ({ n: 1 }))

    expect(await cached('k', 60, load)).toEqual({ n: 1 })
    await settle()

    expect(load).toHaveBeenCalledTimes(1)
    expect(store.get('zunor:k')).toBe('{"n":1}')
    expect(ttls.get('zunor:k')).toBe(60)
  })

  it('влучання — база не читається', async () => {
    store.set('zunor:k', '{"n":2}')
    const load = vi.fn(async () => ({ n: 1 }))

    expect(await cached('k', 60, load)).toEqual({ n: 2 })
    expect(load).not.toHaveBeenCalled()
  })

  // Видалений акаунт: без цього кожен запит із ним бив би в базу.
  it('«немає» (null) кешується за замовчуванням', async () => {
    await cached('gone', 60, async () => null)
    await settle()

    const load = vi.fn(async () => null)
    expect(await cached('gone', 60, load)).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it('cacheNull: false — «немає» не запамʼятовується', async () => {
    await cached('free', 60, async () => null, { cacheNull: false })
    await settle()
    expect(store.has('zunor:free')).toBe(false)
  })

  it('битий запис — як промах', async () => {
    store.set('zunor:k', '{не json')
    expect(await cached('k', 60, async () => ({ n: 3 }))).toEqual({ n: 3 })
  })

  it('Redis лежить — відповідає база, без винятку', async () => {
    breakRedis()
    expect(await cached('k', 60, async () => ({ n: 4 }))).toEqual({ n: 4 })
  })

  // Читач полетів у базу до зміни, а повернувся після forget — його
  // застаріла відповідь не має перекрити свіжу.
  it('forget під час читання з бази: застаріле в кеш не потрапляє', async () => {
    let release!: (v: { v: string }) => void
    const pending = cached(
      'race',
      60,
      () => new Promise<{ v: string }>((r) => (release = r)),
    )
    await settle()

    await forget('race')
    release({ v: 'старе' })
    await pending
    await settle()

    expect(store.has('zunor:race')).toBe(false)
  })

  it('forget видаляє ключі під префіксом', async () => {
    store.set('zunor:a', '1')
    store.set('zunor:b', '2')
    await forget('a', 'b')
    expect(fakeRedis.del).toHaveBeenCalledWith('zunor:a', 'zunor:b')
    expect(store.size).toBe(0)
  })
})

describe('запобіжник: лежачий Redis не гальмує кожен запит', () => {
  it('після збою 30 с Redis не питаємо — одразу база', async () => {
    vi.useFakeTimers()
    breakRedis()
    await cached('k', 60, async () => 1)
    expect(fakeRedis.get).toHaveBeenCalledTimes(1)

    resetRedis()
    const load = vi.fn(async () => 2)
    expect(await cached('k', 60, load)).toBe(2)
    expect(fakeRedis.get).toHaveBeenCalledTimes(0)

    vi.advanceTimersByTime(30_000)
    await cached('k', 60, load)
    expect(fakeRedis.get).toHaveBeenCalledTimes(1)
  })

  // Відкликання сесії під запобіжником не пропускається мовчки: пробуємо.
  it('видалення сесії пробує навіть під запобіжником', async () => {
    breakRedis()
    await cached('k', 60, async () => 1)
    resetRedis()

    await authStorage!.delete('token-1')
    expect(fakeRedis.del).toHaveBeenCalledWith('zunor:auth:token-1')
  })
})

describe('сесії better-auth у Redis', () => {
  const storage = authStorage!

  it('пише й читає рядки під префіксом auth, TTL — цілими секундами', async () => {
    await storage.set('token-1', '{"session":{}}', 2591999.7)
    expect(store.get('zunor:auth:token-1')).toBe('{"session":{}}')
    expect(ttls.get('zunor:auth:token-1')).toBe(2591999)
    expect(await storage.get('token-1')).toBe('{"session":{}}')
  })

  it('без TTL — без строку', async () => {
    await storage.set('k', 'v')
    expect(ttls.has('zunor:auth:k')).toBe(false)
  })

  // Сесія лежить і в базі: промах у Redis — це лише запит туди.
  it('збій читання — null, і better-auth іде в базу', async () => {
    breakRedis()
    expect(await storage.get('token-1')).toBeNull()
  })

  // Вихід з акаунта чи бан, що мовчки не видалив сесію з Redis, лишив би
  // її живою до кінця строку.
  it('збій видалення кидає — відкликання не губиться мовчки', async () => {
    breakRedis()
    await expect(storage.delete('token-1')).rejects.toThrow()
  })
})

describe('«онлайн» майстра', () => {
  const MIN = 60_000
  const NOW = new Date('2026-10-25T12:00:00Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  it('Redis — не частіше ніж раз на 2 хв, база — раз на 30 хв', async () => {
    const id = 'presence-1'
    const seenWrites = () =>
      fakeRedis.set.mock.calls.filter(([k]) => k === `zunor:seen:${id}`)

    touchPresence(id)
    expect(seenWrites()).toHaveLength(1)
    expect(prisma.user.update).toHaveBeenCalledTimes(1)

    vi.setSystemTime(NOW.getTime() + MIN)
    touchPresence(id)
    expect(seenWrites()).toHaveLength(1)

    vi.setSystemTime(NOW.getTime() + 2 * MIN)
    touchPresence(id)
    expect(seenWrites()).toHaveLength(2)
    expect(prisma.user.update).toHaveBeenCalledTimes(1)

    vi.setSystemTime(NOW.getTime() + 30 * MIN)
    touchPresence(id)
    expect(prisma.user.update).toHaveBeenCalledTimes(2)
  })

  it('lastSeenMany — одна команда на весь список, кого нема — того нема', async () => {
    store.set('zunor:seen:a', String(NOW.getTime()))
    store.set('zunor:seen:b', 'сміття')

    const seen = await lastSeenMany(['a', 'b', 'c'])

    expect(fakeRedis.mget).toHaveBeenCalledTimes(1)
    expect(seen.get('a')).toEqual(NOW)
    expect(seen.has('b')).toBe(false)
    expect(seen.has('c')).toBe(false)
  })

  it('Redis лежить — порожня мапа, і бал бере час із бази', async () => {
    breakRedis()
    expect((await lastSeenMany(['a'])).size).toBe(0)
  })

  it('freshest — свіжіший із двох', () => {
    const db = new Date(NOW.getTime() - 30 * MIN)
    expect(freshest(db, NOW)).toEqual(NOW)
    expect(freshest(NOW, db)).toEqual(NOW)
    expect(freshest(db, undefined)).toEqual(db)
  })
})

describe('стан акаунта: памʼять → Redis → база', () => {
  const STATE = {
    id: 'u1',
    role: 'CLIENT',
    banned: false,
    emailVerified: true,
    onboarded: true,
  }

  beforeEach(() => clearAccountCache())

  // Рестарт процесу стирає памʼять, але не Redis — база не прокидається.
  it('після рестарту стан береться з Redis', async () => {
    store.set('zunor:account:u1', JSON.stringify(STATE))

    expect(await getAccountState('u1')).toEqual(STATE)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  // Онбординг завершено — наступний запит мусить побачити onboarded: true,
  // а не стару копію з Redis.
  it('invalidateAccount чистить і памʼять, і Redis', async () => {
    prisma.user.findUnique.mockResolvedValue(STATE)
    await getAccountState('u1')
    await settle()
    expect(store.has('zunor:account:u1')).toBe(true)

    await invalidateAccount('u1')
    expect(store.has('zunor:account:u1')).toBe(false)

    await getAccountState('u1')
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2)
  })
})

describe('учасники чату (авторизація каналів Pusher)', () => {
  it('«так» запамʼятовується — повторна підписка без бази', async () => {
    prisma.chatMember.findUnique.mockResolvedValue({ chatId: 'c1' })

    expect(await isChatMember('c1', 'u1')).toBe(true)
    await settle()
    expect(await isChatMember('c1', 'u1')).toBe(true)
    expect(prisma.chatMember.findUnique).toHaveBeenCalledTimes(1)
  })

  // Чат могли створити мить тому — «ні» не має застрягнути в кеші.
  it('«ні» не запамʼятовується', async () => {
    prisma.chatMember.findUnique.mockResolvedValue(null)

    expect(await isChatMember('c2', 'u1')).toBe(false)
    await settle()
    prisma.chatMember.findUnique.mockResolvedValue({ chatId: 'c2' })
    expect(await isChatMember('c2', 'u1')).toBe(true)
  })
})

describe('публічна сторінка майстра', () => {
  const user = (username: string) => ({
    id: 'm1',
    role: 'MASTER',
    username,
    name: 'Іван',
    avatar: null,
    bio: null,
    city: 'odesa',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    avgRatingAsMaster: 4.9,
    reviewsCountAsMaster: 3,
    masterProfile: {
      verificationStatus: 'VERIFIED',
      categories: ['cleaning'],
      portfolioImages: [],
      completedOrders: 5,
    },
  })

  beforeEach(() => {
    prisma.review.findMany.mockResolvedValue([])
  })

  it('повторний перегляд — без жодного запиту в базу', async () => {
    prisma.user.findUnique.mockResolvedValue(user('ivan'))

    expect((await loadMasterPage('ivan'))?.username).toBe('ivan')
    await settle()
    resetPrisma()

    expect((await loadMasterPage('ivan'))?.username).toBe('ivan')
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  // Вільний сьогодні username завтра займуть — «немає» не кешуємо.
  it('неіснуючий username не запамʼятовується', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    expect(await loadMasterPage('nobody')).toBeNull()
    await settle()
    expect(store.has('zunor:handle:nobody')).toBe(false)
  })

  it('після forgetMasterPage сторінка перечитується з бази', async () => {
    prisma.user.findUnique.mockResolvedValue(user('ivan'))
    await loadMasterPage('ivan')
    await settle()

    await forgetMasterPage('m1')
    prisma.user.findUnique.mockResolvedValue({
      ...user('ivan'),
      name: 'Іван П.',
    })

    expect((await loadMasterPage('ivan'))?.name).toBe('Іван П.')
  })

  // Майстра перейменували: старе посилання не має жити до кінця TTL.
  it('username змінився — за старим посиланням сторінки немає одразу', async () => {
    store.set('zunor:handle:ivan', '"m1"')
    prisma.user.findUnique.mockResolvedValue(user('petro'))

    expect(await loadMasterPage('ivan')).toBeNull()
    expect(store.has('zunor:handle:ivan')).toBe(false)
  })

  it('дата в кеші — рядок ISO, а не Date', async () => {
    prisma.user.findUnique.mockResolvedValue(user('ivan'))
    const page = await loadMasterPage('ivan')
    expect(page?.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('довідники: памʼять → Redis → база', () => {
  const ROW = {
    citySlug: 'odesa',
    slug: 'center',
    name: 'Центр',
    group: 'CITY',
    lat: 46.48,
    lng: 30.73,
  }

  beforeEach(async () => {
    await invalidateReference()
  })

  it('після рестарту райони беруться з Redis', async () => {
    store.set('zunor:ref:districts', JSON.stringify([ROW]))

    expect(await getDistricts()).toEqual([ROW])
    expect(prisma.district.findMany).not.toHaveBeenCalled()
  })

  it('invalidateReference чистить і Redis', async () => {
    store.set('zunor:ref:districts', JSON.stringify([ROW]))
    await invalidateReference()
    expect(store.has('zunor:ref:districts')).toBe(false)
  })
})
