import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import {
  makeEvent,
  sessionUser,
  anonymous,
  failure,
  okJson,
} from '../helpers/event'

const saveClientProfile = vi.fn(async (_userId: string, _body: unknown) => {})
const saveMasterProfile = vi.fn(async (_userId: string, _body: unknown) => {})

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/profile', () => ({ saveClientProfile, saveMasterProfile }))

const clientRoute = await import('../../routes/api/profile/client/+server')
const masterRoute = await import('../../routes/api/profile/master/+server')
const aiProfileRoute =
  await import('../../routes/api/profile/ai-profile/+server')
const usernameCheck =
  await import('../../routes/api/user/username/check/+server')

// Роути профілю тонкі: авторизація, ліміт і передача тіла в $lib/server/profile.
// Сама валідація перевіряється окремо (profile-save.test.ts) — тут стежимо,
// щоб роут не пускав повз гард і не втрачав ліміт.

/** Кожен тест бере свій userId: rate-limit тримає стан у пам'яті модуля. */
let seq = 0
const freshUser = () => `profile-user-${++seq}-${Date.now()}`

beforeEach(() => {
  resetPrisma()
  saveClientProfile.mockClear()
  saveMasterProfile.mockClear()
})

describe('POST /api/profile/client', () => {
  it('гість — 401', async () => {
    const res = await failure(() =>
      clientRoute.POST(makeEvent({ locals: anonymous, body: {} })),
    )
    expect(res.status).toBe(401)
    expect(saveClientProfile).not.toHaveBeenCalled()
  })

  it('передає тіло разом із userId із СЕСІЇ, а не з тіла', async () => {
    const user = freshUser()

    await clientRoute.POST(
      makeEvent({
        locals: sessionUser(user),
        body: { name: 'Оля', userId: 'чужий-id' },
      }),
    )

    expect(saveClientProfile.mock.calls[0][0]).toBe(user)
  })

  it('зламаний JSON доходить як null, а не валить роут', async () => {
    const user = freshUser()
    await clientRoute.POST(
      makeEvent({ locals: sessionUser(user), body: '{ ламаний' }),
    )
    expect(saveClientProfile).toHaveBeenCalledWith(user, null)
  })

  // 20 подач на годину: кожна подача майстра шле сповіщення модераторам,
  // без ліміту це спам-канал.
  it('21-ша подача за годину — 429', async () => {
    const user = freshUser()

    for (let i = 0; i < 20; i++) {
      const res = (await clientRoute.POST(
        makeEvent({ locals: sessionUser(user), body: {} }),
      )) as Response
      expect(res.status).toBe(200)
    }

    const res = await failure(() =>
      clientRoute.POST(makeEvent({ locals: sessionUser(user), body: {} })),
    )
    expect(res.status).toBe(429)
  })
})

describe('POST /api/profile/master', () => {
  it('гість — 401', async () => {
    const res = await failure(() =>
      masterRoute.POST(makeEvent({ locals: anonymous, body: {} })),
    )
    expect(res.status).toBe(401)
    expect(saveMasterProfile).not.toHaveBeenCalled()
  })

  it('передає тіло разом із userId із сесії', async () => {
    const user = freshUser()
    await masterRoute.POST(
      makeEvent({ locals: sessionUser(user), body: { username: 'ivan' } }),
    )
    expect(saveMasterProfile.mock.calls[0][0]).toBe(user)
  })

  // Ліміт спільний із клієнтським профілем (ключ profile:${id}) — інакше
  // його обходили б, чергуючи два ендпоінти.
  it('ліміт спільний для обох форм профілю', async () => {
    const user = freshUser()

    for (let i = 0; i < 20; i++) {
      await clientRoute.POST(makeEvent({ locals: sessionUser(user), body: {} }))
    }

    const res = await failure(() =>
      masterRoute.POST(makeEvent({ locals: sessionUser(user), body: {} })),
    )
    expect(res.status).toBe(429)
  })
})

describe('POST /api/profile/ai-profile', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue({ role: 'CLIENT' })
  })

  it('гість — 401', async () => {
    const res = await failure(() =>
      aiProfileRoute.POST(makeEvent({ locals: anonymous, body: {} })),
    )
    expect(res.status).toBe(401)
  })

  // Роль перевіряється на сервері, а не покладається на приховування в UI:
  // майстер може просто відкрити DevTools.
  it('майстру анкета недоступна — 403', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'MASTER' })

    const res = await failure(() =>
      aiProfileRoute.POST(
        makeEvent({ locals: sessionUser(freshUser()), body: {} }),
      ),
    )
    expect(res.status).toBe(403)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('анкета проходить через parseAiProfile, а не пишеться як є', async () => {
    await aiProfileRoute.POST(
      makeEvent({
        locals: sessionUser(freshUser()),
        body: {
          about: '<script>alert(1)</script>',
          objects: [{ premise: 'вигадане', note: 'x' }],
          services: ['вигадана'],
          evil: 'payload',
        },
      }),
    )

    const profile = prisma.user.update.mock.calls[0][0].data.aiProfile
    expect(profile.about).not.toContain('<')
    expect(profile.objects).toEqual([])
    expect(profile.services).toEqual([])
    expect(profile).not.toHaveProperty('evil')
  })

  it('пише анкету саме своєму користувачу', async () => {
    const user = freshUser()
    await aiProfileRoute.POST(
      makeEvent({ locals: sessionUser(user), body: { callName: 'Оля' } }),
    )

    expect(prisma.user.update.mock.calls[0][0].where).toEqual({ id: user })
  })
})

describe('GET /api/user/username/check', () => {
  it('гість — 401', async () => {
    const res = await failure(() =>
      usernameCheck.GET(
        makeEvent({
          url: '/api/user/username/check?username=ivan',
          locals: anonymous,
        }),
      ),
    )
    expect(res.status).toBe(401)
  })

  // Ендпоінт не має ставати оракулом: невалідний формат відсікається до
  // запиту в базу, тобто перебором його не розкачаєш.
  it('невалідний або зарезервований username — «недоступно» без запиту в БД', async () => {
    for (const u of ['ab', 'admin', '1abc', 'a-b', '']) {
      resetPrisma()

      const body = await okJson<{ available: boolean }>(() =>
        usernameCheck.GET(
          makeEvent({
            url: `/api/user/username/check?username=${encodeURIComponent(u)}`,
            locals: sessionUser('u1'),
          }),
        ),
      )

      expect(body.available).toBe(false)
      expect(prisma.user.findFirst).not.toHaveBeenCalled()
    }
  })

  it('зайнятий іншим — недоступно', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'someone-else' })

    const body = await okJson<{ available: boolean }>(() =>
      usernameCheck.GET(
        makeEvent({
          url: '/api/user/username/check?username=mihalcann',
          locals: sessionUser('u1'),
        }),
      ),
    )
    expect(body.available).toBe(false)
  })

  it('власний username не рахується зайнятим', async () => {
    prisma.user.findFirst.mockResolvedValue(null)

    await usernameCheck.GET(
      makeEvent({
        url: '/api/user/username/check?username=mihalcann',
        locals: sessionUser('u1'),
      }),
    )

    expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({
      username: 'mihalcann',
      NOT: { id: 'u1' },
    })
  })

  it('регістр нормалізується перед перевіркою', async () => {
    prisma.user.findFirst.mockResolvedValue(null)

    await usernameCheck.GET(
      makeEvent({
        url: '/api/user/username/check?username=MiHaLcAnN',
        locals: sessionUser('u1'),
      }),
    )

    expect(prisma.user.findFirst.mock.calls[0][0].where.username).toBe(
      'mihalcann',
    )
  })
})
