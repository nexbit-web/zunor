import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from '../helpers/prisma-mock'
import { pusherServer, resetInfra } from '../helpers/infra'
import { makeEvent, sessionUser, anonymous, failure } from '../helpers/event'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/pusher', async () => await import('../helpers/infra'))

const { POST } = await import('../../routes/api/pusher/auth/+server')

// Це воротар усього realtime. Підписаний токен, який тут видається, дає
// браузеру читати ВСІ повідомлення каналу — без обмежень і без повторної
// перевірки на сервері. Помилка тут означає чужу переписку в чужому браузері.

function authEvent(userId: string | null, channel: string) {
  return makeEvent({
    form: { socket_id: '123.456', channel_name: channel },
    locals: userId ? sessionUser(userId) : anonymous,
  })
}

beforeEach(() => {
  resetPrisma()
  resetInfra()
})

describe('приватний канал користувача', () => {
  it('гість не отримує токен', async () => {
    const res = await failure(() => POST(authEvent(null, 'private-user-u1')))
    expect(res.status).toBe(401)
    expect(pusherServer.authorizeChannel).not.toHaveBeenCalled()
  })

  it('свій канал авторизується', async () => {
    const res = (await POST(authEvent('u1', 'private-user-u1'))) as Response
    expect(res.status).toBe(200)
    expect(pusherServer.authorizeChannel).toHaveBeenCalledWith(
      '123.456',
      'private-user-u1',
    )
  })

  // Це та сама підстановка id, що й у REST: канал приходить із браузера.
  it('чужий канал — 403, токен не видається', async () => {
    const res = await failure(() => POST(authEvent('u1', 'private-user-u2')))
    expect(res.status).toBe(403)
    expect(pusherServer.authorizeChannel).not.toHaveBeenCalled()
  })
})

describe('канал чату', () => {
  it('учасник чату отримує токен', async () => {
    prisma.chatMember.findUnique.mockResolvedValue({
      user: { id: 'u1', name: 'Оля', avatar: null },
    })

    const res = (await POST(authEvent('u1', 'private-chat-chat-1'))) as Response
    expect(res.status).toBe(200)
    expect(prisma.chatMember.findUnique).toHaveBeenCalledWith({
      where: { chatId_userId: { chatId: 'chat-1', userId: 'u1' } },
      select: expect.anything(),
    })
  })

  it('не-учасник чату не отримує токен', async () => {
    prisma.chatMember.findUnique.mockResolvedValue(null)

    const res = await failure(() =>
      POST(authEvent('u1', 'private-chat-chat-1')),
    )
    expect(res.status).toBe(403)
    expect(pusherServer.authorizeChannel).not.toHaveBeenCalled()
  })

  it('presence-канал теж вимагає членства', async () => {
    prisma.chatMember.findUnique.mockResolvedValue(null)

    const res = await failure(() =>
      POST(authEvent('u1', 'presence-chat-chat-1')),
    )
    expect(res.status).toBe(403)
  })

  it('presence віддає лише публічні поля учасника', async () => {
    prisma.chatMember.findUnique.mockResolvedValue({
      user: {
        id: 'u1',
        name: 'Оля',
        avatar: 'https://res.cloudinary.com/a.jpg',
      },
    })

    await POST(authEvent('u1', 'presence-chat-chat-1'))

    const [, , presenceData] = pusherServer.authorizeChannel.mock.calls[0]
    expect(presenceData).toEqual({
      user_id: 'u1',
      user_info: { name: 'Оля', avatar: 'https://res.cloudinary.com/a.jpg' },
    })
    // Ані email, ані телефону в presence бути не може: ці дані бачать УСІ
    // учасники каналу.
    expect(JSON.stringify(presenceData)).not.toContain('@')
  })
})

describe('невідомі канали', () => {
  it('канал іншого типу відхиляється', async () => {
    const res = await failure(() => POST(authEvent('u1', 'private-admin')))
    expect(res.status).toBe(400)
    expect(prisma.chatMember.findUnique).not.toHaveBeenCalled()
  })

  it('без socket_id або channel_name — 400', async () => {
    const res = await failure(() =>
      POST(
        makeEvent({ form: { socket_id: '1.2' }, locals: sessionUser('u1') }),
      ),
    )
    expect(res.status).toBe(400)
  })
})
