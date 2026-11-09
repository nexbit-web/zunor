import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { safeTrigger, resetInfra } from '../helpers/infra'
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
vi.mock('$lib/server/pusher', async () => await import('../helpers/infra'))

const { POST } = await import('../../routes/api/reports/+server')

// POST /api/reports — «Поскаржитися». Стережемо:
//
//   • причина лише з закритого набору, «Інше» — з поясненням;
//   • контекст (замовлення, чат, заявка) чужий не приймається: інакше
//     відповідь «ок / 404» розповідала б, хто з ким працює;
//   • повтор за добу не плодить записів, а модератор CRM дізнається про
//     нову скаргу подією report:new.

function post(body: unknown, id: string) {
  return POST(makeEvent({ body, locals: sessionUser(id) }))
}

beforeEach(() => {
  resetPrisma()
  resetInfra()
  prisma.user.findUnique.mockResolvedValue({ id: 'target' })
  prisma.report.findFirst.mockResolvedValue(null)
  prisma.report.create.mockResolvedValue({ id: 'r1' })
})

describe('POST /api/reports', () => {
  it('гість отримує 401', async () => {
    const res = await failure(() =>
      POST(makeEvent({ body: {}, locals: anonymous })),
    )
    expect(res.status).toBe(401)
  })

  it('на себе поскаржитися не можна', async () => {
    const res = await failure(() =>
      post({ targetId: 'a1', reason: 'rude' }, 'a1'),
    )
    expect(res.status).toBe(400)
    expect(prisma.report.create).not.toHaveBeenCalled()
  })

  it('причина — лише з набору', async () => {
    const res = await failure(() =>
      post({ targetId: 'target', reason: 'hack' }, 'a2'),
    )
    expect(res.status).toBe(400)
  })

  it('«Інше» без пояснення — відмова', async () => {
    const res = await failure(() =>
      post({ targetId: 'target', reason: 'other', text: 'ну' }, 'a3'),
    )
    expect(res.status).toBe(400)
  })

  it('неіснуюча людина — 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    const res = await failure(() =>
      post({ targetId: 'ghost', reason: 'rude' }, 'a4'),
    )
    expect(res.status).toBe(404)
  })

  it('чуже замовлення як контекст — 404, нічого не пише', async () => {
    prisma.order.findFirst.mockResolvedValue(null)

    const res = await failure(() =>
      post({ targetId: 'target', reason: 'no_show', orderId: 'o1' }, 'a5'),
    )

    expect(res.status).toBe(404)
    // Замовлення має належати обом: скаржнику й тому, на кого скарга.
    const where = prisma.order.findFirst.mock.calls[0][0].where
    expect(where.OR).toEqual([
      { clientId: 'a5', masterId: 'target' },
      { clientId: 'target', masterId: 'a5' },
    ])
    expect(prisma.report.create).not.toHaveBeenCalled()
  })

  it('чат, де немає обох, — 404', async () => {
    prisma.chatMember.count.mockResolvedValue(1)
    const res = await failure(() =>
      post({ targetId: 'target', reason: 'rude', chatId: 'c1' }, 'a6'),
    )
    expect(res.status).toBe(404)
  })

  it('два контексти разом — відмова', async () => {
    const res = await failure(() =>
      post(
        { targetId: 'target', reason: 'rude', orderId: 'o1', chatId: 'c1' },
        'a7',
      ),
    )
    expect(res.status).toBe(400)
  })

  it('пише скаргу й кличе модератора подією report:new', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o1' })

    await okJson(() =>
      post(
        {
          targetId: 'target',
          reason: 'no_show',
          text: '  не прийшов  ',
          orderId: 'o1',
        },
        'a8',
      ),
    )

    expect(prisma.report.create.mock.calls[0][0].data).toEqual({
      reporterId: 'a8',
      targetId: 'target',
      reason: 'no_show',
      text: 'не прийшов',
      orderId: 'o1',
      chatId: null,
      jobId: null,
    })
    expect(safeTrigger).toHaveBeenCalledWith('private-admin', 'report:new', {
      reportId: 'r1',
      reason: 'no_show',
    })
  })

  it('повтор за добу — без нового запису й без події', async () => {
    prisma.report.findFirst.mockResolvedValue({ id: 'old' })

    await okJson(() => post({ targetId: 'target', reason: 'rude' }, 'a9'))

    expect(prisma.report.create).not.toHaveBeenCalled()
    expect(safeTrigger).not.toHaveBeenCalled()
  })

  it('не більше 5 скарг на годину від людини', async () => {
    for (let i = 0; i < 5; i++) {
      await okJson(() => post({ targetId: 'target', reason: 'rude' }, 'a10'))
    }
    const res = await failure(() =>
      post({ targetId: 'target', reason: 'rude' }, 'a10'),
    )
    expect(res.status).toBe(429)
  })
})
