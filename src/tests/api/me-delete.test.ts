import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { cancelWaves, resetInfra } from '../helpers/infra'
import {
  makeEvent,
  sessionUser,
  anonymous,
  failure,
  okJson,
} from '../helpers/event'

const cloud = vi.hoisted(() => ({
  deleteByPrefix: vi.fn(async (_prefix: string) => ({})),
}))
const revokeSessions = vi.hoisted(() => vi.fn(async (_userId: string) => {}))
const invalidateAccount = vi.hoisted(() =>
  vi.fn(async (_userId: string) => {}),
)

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/dispatch', async () => await import('../helpers/infra'))
vi.mock('$lib/server/cloudinary', () => ({
  cloudinary: { api: { delete_resources_by_prefix: cloud.deleteByPrefix } },
}))
vi.mock('$lib/server/sessions', () => ({ revokeSessions }))
vi.mock('$lib/server/account-cache', () => ({ invalidateAccount }))

const { DELETE } = await import('../../routes/api/me/+server')

// DELETE /api/me — «право бути забутим». Видалення тут — знеособлення:
// рядок User лишається (на нього посилаються замовлення й відгуки іншої
// сторони), а все, що робить його людиною, стирається. Стережемо три
// обіцянки:
//
//   • без введеної руками своєї пошти нічого не відбувається;
//   • з активним замовленням — відмова, друга сторона не лишається ні з чим;
//   • після видалення увійти неможливо, а з розсилки людина зникає.

/** Запит від u1 (пошта в сесії — u1@example.com). */
function del(body: unknown, id = 'u1') {
  return DELETE(
    makeEvent({ method: 'DELETE', body, locals: sessionUser(id) }),
  )
}

/** Перший виклик методу моделі — його аргумент. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arg = (fn: any) => fn.mock.calls[0][0]

beforeEach(() => {
  resetPrisma()
  resetInfra()
  cloud.deleteByPrefix.mockClear()
  revokeSessions.mockClear()
  invalidateAccount.mockClear()

  prisma.user.findUnique.mockResolvedValue({ email: 'u1@example.com' })
  prisma.order.count.mockResolvedValue(0)
  prisma.job.findMany.mockResolvedValue([])
  prisma.proposal.findMany.mockResolvedValue([])
})

describe('DELETE /api/me', () => {
  it('гість отримує 401', async () => {
    const res = await failure(() =>
      DELETE(makeEvent({ method: 'DELETE', body: {}, locals: anonymous })),
    )
    expect(res.status).toBe(401)
  })

  it('без підтвердження поштою нічого не стирає', async () => {
    const res = await failure(() => del({}, 'u2'))
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('чужа пошта в підтвердженні — відмова', async () => {
    const res = await failure(() => del({ confirm: 'other@example.com' }, 'u3'))
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('пошта без урахування регістру й пробілів', async () => {
    await okJson(() => del({ confirm: '  U4@Example.com ' }, 'u4'))
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('з активним замовленням — 409, нічого не стирає', async () => {
    prisma.order.count.mockResolvedValue(1)

    const res = await failure(() => del({ confirm: 'u5@example.com' }, 'u5'))

    expect(res.status).toBe(409)
    // Активні — це обидва боки угоди, а не лише замовлення клієнта.
    expect(arg(prisma.order.count).where.OR).toEqual([
      { clientId: 'u5' },
      { masterId: 'u5' },
    ])
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('знеособлює: імʼя, пошта, handle, фото — геть, увійти не можна', async () => {
    await okJson(() => del({ confirm: 'u6@example.com' }, 'u6'))

    const user = arg(prisma.user.update)
    expect(user.where).toEqual({ id: 'u6' })
    expect(user.data).toMatchObject({
      name: 'Видалений акаунт',
      username: null,
      phone: null,
      avatar: null,
      bio: null,
      banned: true,
    })
    // Справжня пошта звільнена для нової реєстрації.
    expect(user.data.email).not.toBe('u6@example.com')
    expect(user.data.email).toMatch(/\.invalid$/)

    // Способи входу й сесії — геть.
    expect(arg(prisma.account.deleteMany)).toEqual({ where: { userId: 'u6' } })
    expect(revokeSessions).toHaveBeenCalledWith('u6')
    expect(invalidateAccount).toHaveBeenCalledWith('u6')
  })

  it('майстер зникає з розсилки, стрічки й рекомендацій', async () => {
    await okJson(() => del({ confirm: 'u7@example.com' }, 'u7'))

    const mp = arg(prisma.masterProfile.updateMany)
    expect(mp.where).toEqual({ userId: 'u7' })
    expect(mp.data.isActive).toBe(false)
    expect(mp.data.portfolioImages).toEqual([])
  })

  it('відкриті заявки скасовує й знімає їхні хвилі', async () => {
    prisma.job.findMany.mockResolvedValue([{ id: 'j1' }, { id: 'j2' }])

    await okJson(() => del({ confirm: 'u8@example.com' }, 'u8'))

    expect(prisma.job.updateMany.mock.calls[0][0]).toEqual({
      where: { id: { in: ['j1', 'j2'] } },
      data: expect.objectContaining({ status: 'CANCELLED' }),
    })
    expect(cancelWaves).toHaveBeenCalledWith('j1')
    expect(cancelWaves).toHaveBeenCalledWith('j2')
  })

  it('пропозиції майстра, що чекають, відкликає з лічильником заявки', async () => {
    prisma.proposal.findMany.mockResolvedValue([{ id: 'p1', jobId: 'j9' }])

    await okJson(() => del({ confirm: 'u9@example.com' }, 'u9'))

    expect(arg(prisma.proposal.update)).toEqual({
      where: { id: 'p1' },
      data: expect.objectContaining({ status: 'WITHDRAWN' }),
    })
    expect(arg(prisma.job.update)).toEqual({
      where: { id: 'j9' },
      data: { proposalsCount: { decrement: 1 } },
    })
  })

  it('файли — лише з теки цього користувача', async () => {
    await okJson(() => del({ confirm: 'u10@example.com' }, 'u10'))
    expect(cloud.deleteByPrefix).toHaveBeenCalledWith('zunor/users/u10/')
  })

  it('збій хмари не повертає помилку: акаунт уже знеособлено', async () => {
    cloud.deleteByPrefix.mockRejectedValueOnce(new Error('cloud down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await okJson(() => del({ confirm: 'u11@example.com' }, 'u11'))

    spy.mockRestore()
  })
})
