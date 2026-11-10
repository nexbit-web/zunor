import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from './helpers/prisma-mock'
import { Notify, resetInfra } from './helpers/infra'
import { CATEGORY_SLUG } from '$lib/categories/cleaning/presets'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('./helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/notifications', async () => await import('./helpers/infra'))

const { sendDayBeforeReminders, msUntilNextRun, pastTodaysRun, kyivDay, REMINDER_EVENT } =
  await import('$lib/server/reminders')

const HOUR = 3_600_000

// Нагадування за день до прибирання. Головне, що тут тримається:
// «завтра» рахується в календарі Києва, відносне «завтра» заявки — від дня
// її СТВОРЕННЯ, і двічі те саме замовлення не нагадується.

describe('розклад — 18:00 за Києвом', () => {
  it('зимовий час (UTC+2): з полудня до прогону — 6 годин', () => {
    expect(msUntilNextRun(new Date('2026-11-08T10:00:00Z'))).toBe(6 * HOUR)
  })

  it('літній час (UTC+3): прогін о 15:00 UTC', () => {
    expect(msUntilNextRun(new Date('2026-07-01T10:00:00Z'))).toBe(5 * HOUR)
  })

  it('після 18:00 — наступний прогін завтра, а сьогоднішній уже минув', () => {
    const now = new Date('2026-11-08T17:00:00Z') // 19:00 у Києві
    expect(msUntilNextRun(now)).toBe(23 * HOUR)
    expect(pastTodaysRun(now)).toBe(true)
    expect(pastTodaysRun(new Date('2026-11-08T15:59:00Z'))).toBe(false)
  })

  it('день — київський, а не UTC: 23:30 UTC — це вже наступна доба', () => {
    expect(kyivDay(new Date('2026-11-08T23:30:00Z'))).toBe('2026-11-09')
  })
})

describe('sendDayBeforeReminders', () => {
  // 18:00 у Києві 8 листопада — «завтра» це 9-те.
  const NOW = new Date('2026-11-08T16:00:00Z')

  function order(id: string, when: string, jobCreatedAt: string, category = CATEGORY_SLUG) {
    return {
      id,
      title: `Прибирання ${id}`,
      metadata: { when },
      createdAt: new Date(jobCreatedAt),
      clientId: `client-${id}`,
      masterId: `master-${id}`,
      client: { name: 'Олена' },
      master: { name: 'Ігор' },
      fromJob: { category, createdAt: new Date(jobCreatedAt) },
    }
  }

  beforeEach(() => {
    resetPrisma()
    resetInfra()
    prisma.orderEvent.create.mockResolvedValue({})
  })

  it('нагадує обом сторонам лише про замовлення на завтра', async () => {
    prisma.order.findMany.mockResolvedValue([
      order('date', '2026-11-09', '2026-11-01T09:00:00Z'), // дата — завтра
      order('rel', 'tomorrow', '2026-11-08T08:00:00Z'), // «завтра» від сьогодні
      order('old', 'tomorrow', '2026-11-07T08:00:00Z'), // це «завтра» — сьогодні
      order('later', '2026-11-12', '2026-11-01T09:00:00Z'),
      order('other', '2026-11-09', '2026-11-01T09:00:00Z', 'unknown-category'),
    ])

    expect(await sendDayBeforeReminders(NOW)).toBe(2)

    const reminded = prisma.orderEvent.create.mock.calls.map((c: unknown[]) => (c[0] as { data: unknown }).data)
    expect(reminded).toEqual([
      { orderId: 'date', type: REMINDER_EVENT, payload: { day: '2026-11-09' } },
      { orderId: 'rel', type: REMINDER_EVENT, payload: { day: '2026-11-09' } },
    ])
    expect(Notify.orderReminderClient).toHaveBeenCalledWith('client-date', 'date', 'Прибирання date', 'Ігор')
    expect(Notify.orderReminderMaster).toHaveBeenCalledWith('master-date', 'date', 'Прибирання date', 'Олена')
    expect(Notify.orderReminderClient).toHaveBeenCalledTimes(2)
    expect(Notify.orderReminderMaster).toHaveBeenCalledTimes(2)
  })

  it('у вибірці — лише непочаті, ненагадані, без заблокованих і не щойно створені', async () => {
    prisma.order.findMany.mockResolvedValue([])
    await sendDayBeforeReminders(NOW)

    const { where, take } = prisma.order.findMany.mock.calls[0][0]
    expect(where.status).toBe('CREATED')
    expect(where.removedAt).toBeNull()
    expect(where.events).toEqual({ none: { type: REMINDER_EVENT } })
    expect(where.client).toEqual({ banned: false })
    expect(where.master).toEqual({ banned: false })
    expect(where.createdAt.lte.getTime()).toBe(NOW.getTime() - 3 * HOUR)
    expect(take).toBeGreaterThan(0)
  })

  it('відмітка пишеться ДО сповіщень — збій не дасть повтору завтра', async () => {
    prisma.order.findMany.mockResolvedValue([order('a', '2026-11-09', '2026-11-01T09:00:00Z')])
    await sendDayBeforeReminders(NOW)

    const marked = prisma.orderEvent.create.mock.invocationCallOrder[0]
    expect(marked).toBeLessThan(Notify.orderReminderClient.mock.invocationCallOrder[0])
    expect(marked).toBeLessThan(Notify.orderReminderMaster.mock.invocationCallOrder[0])
  })

  it('одночасний другий прогін (крон поверх таймера) нічого не робить', async () => {
    prisma.order.findMany.mockResolvedValue([order('a', '2026-11-09', '2026-11-01T09:00:00Z')])

    const [first, second] = await Promise.all([
      sendDayBeforeReminders(NOW),
      sendDayBeforeReminders(NOW),
    ])
    expect([first, second].sort()).toEqual([0, 1])
    expect(prisma.order.findMany).toHaveBeenCalledTimes(1)
  })
})
