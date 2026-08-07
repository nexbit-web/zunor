import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import {
  makeEvent,
  sessionUser,
  anonymous,
  failure,
  okJson,
} from '../helpers/event'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))

const { GET, POST } = await import('../../routes/api/notifications/+server')

// Сповіщення — приватна стрічка користувача. Два ризики: прочитати чужі
// (фільтр userId має бути в КОЖНОМУ запиті) і покласти базу масивом id
// з тіла запиту.

const USER = 'user-1'

function notificationRow(i: number) {
  return {
    id: `n-${i}`,
    type: 'NEW_PROPOSAL',
    title: 'Новий відгук',
    body: 'текст',
    orderId: null,
    proposalId: null,
    jobId: null,
    chatId: null,
    isRead: false,
    createdAt: new Date(),
  }
}

beforeEach(() => {
  resetPrisma()
  prisma.notification.findMany.mockResolvedValue([])
  prisma.notification.count.mockResolvedValue(0)
  prisma.notification.updateMany.mockResolvedValue({ count: 0 })
  prisma.notification.deleteMany.mockResolvedValue({ count: 0 })
})

describe('GET', () => {
  it('гість — 401', async () => {
    expect(
      (
        await failure(() =>
          GET(makeEvent({ url: '/api/notifications', locals: anonymous })),
        )
      ).status,
    ).toBe(401)
  })

  it('вибірка завжди обмежена своїм userId', async () => {
    await GET(
      makeEvent({ url: '/api/notifications', locals: sessionUser(USER) }),
    )

    expect(prisma.notification.findMany.mock.calls[0][0].where.userId).toBe(
      USER,
    )
    expect(prisma.notification.count.mock.calls[0][0].where.userId).toBe(USER)
  })

  // limit приходить із query — тобто з-під контролю клієнта.
  it('числовий limit затиснутий у межі 1..50', async () => {
    const cases: [string, number][] = [
      ['1000', 50],
      ['-5', 1],
      ['0', 1],
      ['30', 30],
    ]

    for (const [raw, expected] of cases) {
      resetPrisma()
      prisma.notification.findMany.mockResolvedValue([])
      prisma.notification.count.mockResolvedValue(0)

      await GET(
        makeEvent({
          url: `/api/notifications?limit=${raw}`,
          locals: sessionUser(USER),
        }),
      )

      // take = limit + 1 («зазирнути на рядок далі»)
      expect(prisma.notification.findMany.mock.calls[0][0].take).toBe(
        expected + 1,
      )
    }
  })

  // ── ЗНАЙДЕНА ДІРКА ────────────────────────────────────────────────────
  //
  // Math.min(50, Math.max(1, Number('abc'))) === NaN: обидва Math не
  // «виправляють» NaN, вони його ПРОПУСКАЮТЬ. Далі take: NaN їде в Prisma,
  // той кидає помилку валідації — і клієнт отримує 500 замість стрічки.
  //
  // Робоче посилання: /api/notifications?limit=abc
  //
  // Це не витік даних, але для проду болить: будь-який бот або кривий
  // клієнтський код генерує потік 500-х, які виглядають як падіння сервісу.
  // Лікується перевіркою Number.isFinite перед затисканням.
  //
  // Тест ЧЕРВОНИЙ навмисно.
  it('ДІРКА: нечисловий limit перетворюється на NaN і їде в базу', async () => {
    await GET(
      makeEvent({
        url: '/api/notifications?limit=abc',
        locals: sessionUser(USER),
      }),
    )

    const take = prisma.notification.findMany.mock.calls[0][0].take
    expect(Number.isFinite(take)).toBe(true)
  })

  it('зайвий рядок ріжеться й перетворюється на курсор', async () => {
    prisma.notification.findMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, i) => notificationRow(i)),
    )

    const body = await okJson<{ items: unknown[]; nextCursor: string | null }>(
      () =>
        GET(
          makeEvent({ url: '/api/notifications', locals: sessionUser(USER) }),
        ),
    )

    expect(body.items).toHaveLength(20)
    expect(body.nextCursor).toBe('n-19')
  })
})

describe('POST', () => {
  function actionEvent(userId: string, body: unknown) {
    return makeEvent({ locals: sessionUser(userId), body })
  }

  it('гість — 401', async () => {
    expect(
      (
        await failure(() =>
          POST(
            makeEvent({ locals: anonymous, body: { action: 'mark-all-read' } }),
          ),
        )
      ).status,
    ).toBe(401)
  })

  it('невідома дія — 400', async () => {
    expect(
      (await failure(() => POST(actionEvent(USER, { action: 'drop-table' }))))
        .status,
    ).toBe(400)
  })

  it('зламаний JSON — 400', async () => {
    expect(
      (await failure(() => POST(actionEvent(USER, '{ ламаний')))).status,
    ).toBe(400)
  })

  // Головне тут: чужі id у списку не спрацюють, бо where завжди звужений
  // до власного userId. Без цього будь-хто гасив би чужі сповіщення.
  it('mark-read не виходить за межі власних сповіщень', async () => {
    await POST(
      actionEvent(USER, { action: 'mark-read', ids: ['n-1', 'чужий-id'] }),
    )

    const where = prisma.notification.updateMany.mock.calls[0][0].where
    expect(where.userId).toBe(USER)
    expect(where.id).toEqual({ in: ['n-1', 'чужий-id'] })
  })

  it('delete теж обмежений власним userId', async () => {
    await POST(actionEvent(USER, { action: 'delete', ids: ['n-1'] }))

    expect(prisma.notification.deleteMany.mock.calls[0][0].where.userId).toBe(
      USER,
    )
  })

  // Без стелі один запит перетворюється на IN-список довільної довжини —
  // і база лягає від одного клієнта.
  it('масив id має стелю в 200', async () => {
    const ids = Array.from({ length: 5000 }, (_, i) => `n-${i}`)

    await POST(actionEvent(USER, { action: 'mark-read', ids }))

    expect(
      prisma.notification.updateMany.mock.calls[0][0].where.id.in,
    ).toHaveLength(200)
  })

  it('нерядкові id приводяться до рядка, а не їдуть об’єктами в запит', async () => {
    await POST(
      actionEvent(USER, { action: 'delete', ids: [1, { evil: true }, null] }),
    )

    const list = prisma.notification.deleteMany.mock.calls[0][0].where.id.in
    expect(list.every((v: unknown) => typeof v === 'string')).toBe(true)
  })

  it('mark-all-read гасить лише непрочитані свої', async () => {
    await POST(actionEvent(USER, { action: 'mark-all-read' }))

    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({
      userId: USER,
      isRead: false,
    })
  })

  it('mark-read без id — 400, а не масове оновлення', async () => {
    const res = await failure(() =>
      POST(actionEvent(USER, { action: 'mark-read', ids: [] })),
    )
    expect(res.status).toBe(400)
    expect(prisma.notification.updateMany).not.toHaveBeenCalled()
  })
})
