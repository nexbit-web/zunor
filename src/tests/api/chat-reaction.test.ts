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

const { PUT } =
  await import('../../routes/api/chats/[id]/messages/[messageId]/reaction/+server')

// Реакції на повідомлення. Три речі, які тут не можна зламати:
//   • реагувати можна лише в СВОЄМУ чаті й лише на повідомлення ЦЬОГО чату;
//   • емодзі — тільки з закритого набору: рядок із тіла запиту інакше
//     поїхав би в базу й через Pusher у вкладку співрозмовника;
//   • розсилається ПОВНИЙ стан, а не різниця — вкладка, що пропустила
//     подію, все одно покаже правду.

let n = 0
/** Ліміт реакцій живе в памʼяті модуля — кожен тест бере свого юзера. */
const freshUser = () => `user-${++n}`

function event(userId: string | null, body: unknown) {
  return makeEvent({
    method: 'PUT',
    params: { id: 'chat-1', messageId: 'msg-1' },
    locals: userId ? sessionUser(userId) : anonymous,
    body,
  })
}

beforeEach(() => {
  resetPrisma()
  resetInfra()
  prisma.message.findFirst.mockResolvedValue({ id: 'msg-1', deletedAt: null })
  prisma.messageReaction.findMany.mockResolvedValue([])
})

describe('доступ', () => {
  it('гість — 401', async () => {
    const res = await failure(() => PUT(event(null, { emoji: '❤️' })))
    expect(res.status).toBe(401)
  })

  // 404, а не 403: чужий чат не підтверджує навіть існування повідомлення.
  it('чужий чат чи повідомлення з іншого чату — 404', async () => {
    prisma.message.findFirst.mockResolvedValue(null)

    const res = await failure(() => PUT(event(freshUser(), { emoji: '❤️' })))
    expect(res.status).toBe(404)
    expect(prisma.messageReaction.upsert).not.toHaveBeenCalled()
  })

  it('повідомлення шукається саме в цьому чаті й серед МОЇХ чатів', async () => {
    const user = freshUser()
    await PUT(event(user, { emoji: '❤️' }))

    expect(prisma.message.findFirst.mock.calls[0][0].where).toEqual({
      id: 'msg-1',
      chatId: 'chat-1',
      chat: { members: { some: { userId: user } } },
    })
  })

  it('на видалене повідомлення — 400', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'msg-1',
      deletedAt: new Date(),
    })

    const res = await failure(() => PUT(event(freshUser(), { emoji: '❤️' })))
    expect(res.status).toBe(400)
  })
})

describe('валідація', () => {
  for (const emoji of ['💩', 'like', '<img src=x>', 42, true]) {
    it(`емодзі поза набором (${String(emoji)}) — 400`, async () => {
      const res = await failure(() => PUT(event(freshUser(), { emoji })))
      expect(res.status).toBe(400)
      expect(prisma.messageReaction.upsert).not.toHaveBeenCalled()
    })
  }

  it('зламаний JSON — 400, а не 500', async () => {
    const res = await failure(() => PUT(event(freshUser(), '{не json')))
    expect(res.status).toBe(400)
  })
})

describe('запис', () => {
  it('емодзі — ставить або замінює МОЮ реакцію', async () => {
    const user = freshUser()
    await PUT(event(user, { emoji: '👍' }))

    const call = prisma.messageReaction.upsert.mock.calls[0][0]
    expect(call.where).toEqual({
      messageId_userId: { messageId: 'msg-1', userId: user },
    })
    expect(call.create).toEqual({
      messageId: 'msg-1',
      userId: user,
      emoji: '👍',
    })
    expect(call.update.emoji).toBe('👍')
  })

  it('null — знімає лише мою реакцію', async () => {
    const user = freshUser()
    await PUT(event(user, { emoji: null }))

    expect(prisma.messageReaction.upsert).not.toHaveBeenCalled()
    expect(prisma.messageReaction.deleteMany.mock.calls[0][0].where).toEqual({
      messageId: 'msg-1',
      userId: user,
    })
  })

  it('віддає й розсилає повний стан у канал чату', async () => {
    prisma.messageReaction.findMany.mockResolvedValue([
      { emoji: '👍', userId: 'peer' },
      { emoji: '❤️', userId: 'me' },
    ])

    const json = await okJson<{ reactions: unknown }>(() =>
      PUT(event(freshUser(), { emoji: '❤️' })),
    )
    const expected = [
      { emoji: '👍', userIds: ['peer'] },
      { emoji: '❤️', userIds: ['me'] },
    ]
    expect(json.reactions).toEqual(expected)

    expect(safeTrigger).toHaveBeenCalledWith(
      'private-chat-chat-1',
      'message:reaction',
      { chatId: 'chat-1', messageId: 'msg-1', reactions: expected },
    )
  })

  it('стан читається саме для цього повідомлення', async () => {
    await PUT(event(freshUser(), { emoji: '❤️' }))

    expect(prisma.messageReaction.findMany.mock.calls[0][0].where).toEqual({
      messageId: 'msg-1',
    })
  })
})

describe('ліміт', () => {
  it('скрипт, що смикає реакцію в циклі, упирається в 429', async () => {
    const user = freshUser()
    for (let i = 0; i < 120; i++) await PUT(event(user, { emoji: '❤️' }))

    const res = await failure(() => PUT(event(user, { emoji: '❤️' })))
    expect(res.status).toBe(429)
  })
})
