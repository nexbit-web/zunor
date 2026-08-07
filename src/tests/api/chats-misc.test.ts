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

const loadChatsForUser = vi.fn(async (_userId: string) => [] as unknown[])

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('../helpers/prisma-mock')).prisma,
}))
vi.mock('$lib/server/pusher', async () => await import('../helpers/infra'))
vi.mock('$lib/server/chats-loader', () => ({ loadChatsForUser }))

const chatsList = await import('../../routes/api/chats/+server')
const chatRead = await import('../../routes/api/chats/[id]/read/+server')
const messageItem =
  await import('../../routes/api/chats/[id]/messages/[messageId]/+server')

// Решта чатових ендпоінтів. Спільне правило одне: усе впирається в членство
// в чаті й у власність повідомлення. Окремо стережемо прив'язку messageId
// до chatId — без неї можна правити й видаляти повідомлення в чужому чаті,
// знаючи лише його id.

const USER = 'user-1'

function itemEvent(userId: string, body?: unknown) {
  return makeEvent({
    params: { id: 'chat-1', messageId: 'msg-1' },
    locals: sessionUser(userId),
    body,
  })
}

beforeEach(() => {
  resetPrisma()
  resetInfra()
  loadChatsForUser.mockClear()
  prisma.chatMember.findUnique.mockResolvedValue({ id: 'cm-1' })
  prisma.message.findUnique.mockResolvedValue({
    id: 'msg-1',
    type: 'TEXT',
    senderId: USER,
    chatId: 'chat-1',
    createdAt: new Date(),
    deletedAt: null,
  })
})

describe('GET /api/chats', () => {
  it('гість — 401', async () => {
    const res = await failure(() =>
      chatsList.GET(makeEvent({ url: '/api/chats', locals: anonymous })),
    )
    expect(res.status).toBe(401)
    expect(loadChatsForUser).not.toHaveBeenCalled()
  })

  it('віддає чати саме того, хто питає', async () => {
    await chatsList.GET(
      makeEvent({ url: '/api/chats', locals: sessionUser(USER) }),
    )
    expect(loadChatsForUser).toHaveBeenCalledWith(USER)
  })
})

describe('POST /api/chats/[id]/read', () => {
  it('гість — 401', async () => {
    const res = await failure(() =>
      chatRead.POST(makeEvent({ params: { id: 'chat-1' }, locals: anonymous })),
    )
    expect(res.status).toBe(401)
  })

  it('не-учасник — 403, нічого не оновлюється', async () => {
    prisma.chatMember.findUnique.mockResolvedValue(null)

    const res = await failure(() =>
      chatRead.POST(
        makeEvent({
          params: { id: 'chat-1' },
          locals: sessionUser('stranger'),
        }),
      ),
    )
    expect(res.status).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  // Прочитаними стають ЧУЖІ повідомлення, не свої: інакше лічильник
  // непрочитаних у співрозмовника гаснув би сам собою.
  it('позначає прочитаними лише повідомлення інших', async () => {
    await chatRead.POST(
      makeEvent({ params: { id: 'chat-1' }, locals: sessionUser(USER) }),
    )

    const where = prisma.message.updateMany.mock.calls[0][0].where
    expect(where.chatId).toBe('chat-1')
    expect(where.senderId).toEqual({ not: USER })
    expect(where.isRead).toBe(false)
    // Верхня межа за часом: повідомлення, що прийшло під час запиту,
    // не має мовчки зникнути з непрочитаних.
    expect(where.createdAt.lte).toBeInstanceOf(Date)
  })

  it('позначка й розсилка не залежать від Pusher', async () => {
    await chatRead.POST(
      makeEvent({ params: { id: 'chat-1' }, locals: sessionUser(USER) }),
    )

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(safeTrigger).toHaveBeenCalledWith(
      'private-chat-chat-1',
      'message:read',
      expect.objectContaining({ chatId: 'chat-1', readerId: USER }),
    )
  })
})

describe('PATCH повідомлення', () => {
  it('гість — 401', async () => {
    const res = await failure(() =>
      messageItem.PATCH(
        makeEvent({
          params: { id: 'chat-1', messageId: 'msg-1' },
          locals: anonymous,
          body: { text: 'нове' },
        }),
      ),
    )
    expect(res.status).toBe(401)
  })

  it('чуже повідомлення правити не можна', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      type: 'TEXT',
      senderId: 'someone-else',
      chatId: 'chat-1',
      createdAt: new Date(),
      deletedAt: null,
    })

    const res = await failure(() =>
      messageItem.PATCH(itemEvent(USER, { text: 'нове' })),
    )
    expect(res.status).toBe(403)
    expect(prisma.message.update).not.toHaveBeenCalled()
  })

  // Без цієї перевірки достатньо знати messageId, щоб правити повідомлення
  // в чаті, до якого доступу немає.
  it('повідомлення з іншого чату — 403', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      type: 'TEXT',
      senderId: USER,
      chatId: 'ІНШИЙ-чат',
      createdAt: new Date(),
      deletedAt: null,
    })

    const res = await failure(() =>
      messageItem.PATCH(itemEvent(USER, { text: 'нове' })),
    )
    expect(res.status).toBe(403)
  })

  it('неіснуюче повідомлення — 404', async () => {
    prisma.message.findUnique.mockResolvedValue(null)
    expect(
      (
        await failure(() =>
          messageItem.PATCH(itemEvent(USER, { text: 'нове' })),
        )
      ).status,
    ).toBe(404)
  })

  it('видалене не редагується', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      type: 'TEXT',
      senderId: USER,
      chatId: 'chat-1',
      createdAt: new Date(),
      deletedAt: new Date(),
    })

    expect(
      (
        await failure(() =>
          messageItem.PATCH(itemEvent(USER, { text: 'нове' })),
        )
      ).status,
    ).toBe(400)
  })

  it('фото й файли не редагуються', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      type: 'PHOTO',
      senderId: USER,
      chatId: 'chat-1',
      createdAt: new Date(),
      deletedAt: null,
    })

    expect(
      (
        await failure(() =>
          messageItem.PATCH(itemEvent(USER, { text: 'нове' })),
        )
      ).status,
    ).toBe(400)
  })

  // Вікно редагування: без нього історію переписки можна переписати
  // заднім числом — уже після того, як на неї послались.
  it('після 24 годин редагування закрите', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      type: 'TEXT',
      senderId: USER,
      chatId: 'chat-1',
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      deletedAt: null,
    })

    const res = await failure(() =>
      messageItem.PATCH(itemEvent(USER, { text: 'нове' })),
    )
    expect(res.status).toBe(400)
    expect(res.message).toContain('Edit window')
  })

  it('порожній або задовгий текст — 400', async () => {
    for (const text of ['', '   ', 'я'.repeat(4001)]) {
      expect(
        (await failure(() => messageItem.PATCH(itemEvent(USER, { text }))))
          .status,
      ).toBe(400)
    }
  })

  it('успішна правка оновлює текст, прев’ю і шле подію', async () => {
    const body = await okJson<{ ok: boolean; text: string }>(() =>
      messageItem.PATCH(itemEvent(USER, { text: 'виправлено' })),
    )

    expect(body.ok).toBe(true)
    expect(body.text).toBe('виправлено')
    // Прев'ю чату оновлюється лише якщо це БУЛО останнє повідомлення.
    expect(prisma.chat.updateMany.mock.calls[0][0].where).toEqual({
      id: 'chat-1',
      lastSenderId: USER,
    })
    expect(safeTrigger).toHaveBeenCalledWith(
      'private-chat-chat-1',
      'message:edit',
      expect.objectContaining({ messageId: 'msg-1' }),
    )
  })
})

describe('DELETE повідомлення', () => {
  it('чуже повідомлення видалити не можна', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      senderId: 'someone-else',
      chatId: 'chat-1',
      deletedAt: null,
    })

    const res = await failure(() => messageItem.DELETE(itemEvent(USER)))
    expect(res.status).toBe(403)
    expect(prisma.message.update).not.toHaveBeenCalled()
  })

  it('повідомлення з іншого чату — 403', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      senderId: USER,
      chatId: 'ІНШИЙ-чат',
      deletedAt: null,
    })

    expect(
      (await failure(() => messageItem.DELETE(itemEvent(USER)))).status,
    ).toBe(403)
  })

  // Видалення м'яке: рядок лишається, але текст назовні не віддається
  // (перевірено в chat-messages.test.ts).
  it('своє повідомлення видаляється м’яко', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      senderId: USER,
      chatId: 'chat-1',
      deletedAt: null,
    })

    const body = await okJson<{ ok: boolean }>(() =>
      messageItem.DELETE(itemEvent(USER)),
    )

    expect(body.ok).toBe(true)
    expect(
      prisma.message.update.mock.calls[0][0].data.deletedAt,
    ).toBeInstanceOf(Date)
    expect(prisma.message.delete).not.toHaveBeenCalled()
  })

  it('повторне видалення ідемпотентне', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      senderId: USER,
      chatId: 'chat-1',
      deletedAt: new Date(),
    })

    const body = await okJson<{ alreadyDeleted: boolean }>(() =>
      messageItem.DELETE(itemEvent(USER)),
    )

    expect(body.alreadyDeleted).toBe(true)
    expect(prisma.message.update).not.toHaveBeenCalled()
  })
})
