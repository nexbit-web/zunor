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

const { GET, POST } =
  await import('../../routes/api/chats/[id]/messages/+server')

// Переписка — найчутливіші дані в системі після фото помешкання. Кожен запит
// сюди має впиратися в членство в чаті, а вкладення — тільки з нашого
// Cloudinary: чуже посилання у стрічці чату це і фішинг, і витік IP
// співрозмовника на сторонній сервер.

const USER = 'user-1'

function messageRow(patch: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    type: 'TEXT',
    text: 'Привіт',
    attachmentUrl: null,
    attachmentMimeType: null,
    attachmentSize: null,
    attachmentName: null,
    isRead: false,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    senderId: USER,
    replyToId: null,
    replyTo: null,
    sender: { name: 'Оля', avatar: null },
    ...patch,
  }
}

function postEvent(userId: string, body: unknown) {
  return makeEvent({
    params: { id: 'chat-1' },
    locals: sessionUser(userId),
    body,
  })
}

beforeEach(() => {
  resetPrisma()
  resetInfra()
  prisma.chatMember.findUnique.mockResolvedValue({
    id: 'cm-1',
    chat: { members: [{ userId: 'user-2' }] },
  })
  prisma.message.findMany.mockResolvedValue([])
  prisma.message.create.mockResolvedValue(messageRow())
})

describe('членство в чаті', () => {
  it('гість не читає повідомлення', async () => {
    const res = await failure(() =>
      GET(makeEvent({ params: { id: 'chat-1' }, locals: anonymous })),
    )
    expect(res.status).toBe(401)
  })

  it('не-учасник не читає повідомлення', async () => {
    prisma.chatMember.findUnique.mockResolvedValue(null)

    const res = await failure(() =>
      GET(
        makeEvent({
          params: { id: 'chat-1' },
          locals: sessionUser('stranger'),
        }),
      ),
    )
    expect(res.status).toBe(403)
    expect(prisma.message.findMany).not.toHaveBeenCalled()
  })

  it('не-учасник не пише в чат', async () => {
    prisma.chatMember.findUnique.mockResolvedValue(null)

    const res = await failure(() =>
      POST(postEvent('stranger', { text: 'привіт' })),
    )
    expect(res.status).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('читання', () => {
  it('сторінка має стелю в 50 повідомлень', async () => {
    prisma.message.findMany.mockResolvedValue(
      Array.from({ length: 51 }, (_, i) => messageRow({ id: `msg-${i}` })),
    )

    const body = await okJson<{
      messages: unknown[]
      nextCursor: string | null
    }>(() =>
      GET(makeEvent({ params: { id: 'chat-1' }, locals: sessionUser(USER) })),
    )

    expect(body.messages).toHaveLength(50)
    expect(body.nextCursor).toBe('msg-49')
  })

  // Видалене повідомлення не має «воскресати» через API, навіть якщо рядок
  // ще лежить у базі.
  it('текст і вкладення видаленого повідомлення не віддаються', async () => {
    prisma.message.findMany.mockResolvedValue([
      messageRow({
        text: 'секрет',
        attachmentUrl: 'https://res.cloudinary.com/x.jpg',
        deletedAt: new Date(),
      }),
    ])

    const body = await okJson<{
      messages: { text: string; attachmentUrl: string | null }[]
    }>(() =>
      GET(makeEvent({ params: { id: 'chat-1' }, locals: sessionUser(USER) })),
    )

    expect(body.messages[0].text).toBe('')
    expect(body.messages[0].attachmentUrl).toBeNull()
  })

  it('системні рядки у стрічку не потрапляють', async () => {
    await GET(
      makeEvent({ params: { id: 'chat-1' }, locals: sessionUser(USER) }),
    )

    const where = prisma.message.findMany.mock.calls[0][0].where
    expect(where.type).toEqual({ not: 'SYSTEM' })
  })
})

describe('валідація повідомлення', () => {
  it('порожній текст — 400', async () => {
    expect(
      (await failure(() => POST(postEvent(USER, { text: '   ' })))).status,
    ).toBe(400)
  })

  it('текст понад 4000 символів — 400', async () => {
    expect(
      (await failure(() => POST(postEvent(USER, { text: 'я'.repeat(4001) }))))
        .status,
    ).toBe(400)
  })

  it('невідомий тип повідомлення — 400', async () => {
    expect(
      (
        await failure(() =>
          POST(postEvent(USER, { type: 'SYSTEM', text: 'x' })),
        )
      ).status,
    ).toBe(400)
  })

  it('зламаний JSON — 400, а не 500', async () => {
    const res = await failure(() => POST(postEvent(USER, '{ ламаний')))
    expect(res.status).toBe(400)
  })
})

describe('вкладення', () => {
  it('посилання не з нашого Cloudinary відхиляється', async () => {
    for (const url of [
      'https://evil.com/payload.jpg',
      'http://res.cloudinary.com/x.jpg', // http замість https
      'https://res.cloudinary.com.evil.com/x.jpg', // домен-двійник
      'javascript:alert(1)',
    ]) {
      const res = await failure(() =>
        POST(postEvent(USER, { type: 'PHOTO', attachment: { url } })),
      )
      expect(res.status).toBe(400)
    }
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('PHOTO без вкладення — 400', async () => {
    expect(
      (await failure(() => POST(postEvent(USER, { type: 'PHOTO' })))).status,
    ).toBe(400)
  })

  // Поля вкладення приходять з браузера: без стелі вони їдуть у базу як є.
  it('розмір поза межами не зберігається', async () => {
    await POST(
      postEvent(USER, {
        type: 'PHOTO',
        attachment: {
          url: 'https://res.cloudinary.com/ok.jpg',
          size: 999 * 1024 * 1024,
        },
      }),
    )

    expect(
      prisma.message.create.mock.calls[0][0].data.attachmentSize,
    ).toBeNull()
  })

  it('імʼя файлу і mime обрізаються', async () => {
    await POST(
      postEvent(USER, {
        type: 'FILE',
        attachment: {
          url: 'https://res.cloudinary.com/ok.pdf',
          name: 'я'.repeat(500),
          mimeType: 'x'.repeat(500),
          publicId: 'p'.repeat(500),
        },
      }),
    )

    const data = prisma.message.create.mock.calls[0][0].data
    expect(data.attachmentName.length).toBe(255)
    expect(data.attachmentMimeType.length).toBe(120)
    expect(data.attachmentPublicId.length).toBe(300)
  })
})

describe('відповіді на повідомлення', () => {
  // Без цієї перевірки reply на чужий messageId повертав би у відповіді текст
  // повідомлення з чату, до якого юзер доступу не має.
  it('відповідь на повідомлення з іншого чату — 400', async () => {
    prisma.message.findFirst.mockResolvedValue(null)

    const res = await failure(() =>
      POST(postEvent(USER, { text: 'ок', replyToId: 'msg-from-other-chat' })),
    )
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('перевірка прив’язує повідомлення саме до цього чату', async () => {
    prisma.message.findFirst.mockResolvedValue({ id: 'msg-9' })

    await POST(postEvent(USER, { text: 'ок', replyToId: 'msg-9' }))

    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: { id: 'msg-9', chatId: 'chat-1' },
      select: { id: true },
    })
  })
})

describe('успішна відправка', () => {
  it('пише повідомлення й оновлює прев’ю чату однією транзакцією', async () => {
    await POST(postEvent(USER, { text: 'Привіт' }))
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.chat.update).toHaveBeenCalled()
  })

  it('розсилає подію в канал чату і в особисті канали інших учасників', async () => {
    await POST(postEvent(USER, { text: 'Привіт' }))

    expect(safeTrigger).toHaveBeenCalledWith(
      'private-chat-chat-1',
      'message:new',
      expect.anything(),
    )
    expect(safeTrigger).toHaveBeenCalledWith(
      'private-user-user-2',
      'chat:update',
      expect.objectContaining({ chatId: 'chat-1' }),
    )
  })

  it('відправник не отримує подію у власний особистий канал', async () => {
    await POST(postEvent(USER, { text: 'Привіт' }))

    const personal = safeTrigger.mock.calls.filter(
      (c) => c[0] === `private-user-${USER}`,
    )
    expect(personal).toHaveLength(0)
  })

  it('прев’ю чату обрізається до 200 символів', async () => {
    await POST(postEvent(USER, { text: 'я'.repeat(1000) }))

    const data = prisma.chat.update.mock.calls[0][0].data
    expect(data.lastMessageText.length).toBe(200)
  })
})
