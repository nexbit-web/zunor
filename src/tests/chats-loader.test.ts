import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma, resetPrisma } from './helpers/prisma-mock'

vi.mock('$lib/server/prisma', async () => ({
  prisma: (await import('./helpers/prisma-mock')).prisma,
}))

const { loadChatsForUser } = await import('$lib/server/chats-loader')

// Список чатів віддається у двох місцях: SSR-лейаут /dashboard/messages і
// GET /api/chats (звідти його бере стор сайдбара). Логіка одна на обох, тож
// і тести тут, а не в кожному роуті окремо.
//
// Що стережемо:
//   • стелю на кількість чатів — інакше запит росте разом з історією юзера
//     і тягне з Neon усе підряд на кожен вхід у дашборд;
//   • ОДИН groupBy замість N запитів за непрочитаними;
//   • фільтри лічильника: свої повідомлення й системні події не мають
//     накручувати бейдж;
//   • у peer не тече телефон — це продуктова обіцянка з маніфесту.

const USER = 'user-1'

function membership(
  over: {
    id?: string
    peer?: Record<string, unknown> | null
    lastMessageText?: string | null
    lastMessageAt?: Date | null
    lastSenderId?: string | null
    updatedAt?: Date
  } = {},
) {
  const peer =
    over.peer === null
      ? []
      : [
          {
            user: {
              id: 'peer-1',
              name: 'Оля',
              username: 'olya',
              avatar: null,
              masterProfile: { verificationStatus: 'VERIFIED' },
              ...over.peer,
            },
          },
        ]

  return {
    lastReadAt: new Date('2026-03-15T10:00:00Z'),
    chat: {
      id: over.id ?? 'chat-1',
      updatedAt: over.updatedAt ?? new Date('2026-03-15T12:00:00Z'),
      // `?? ` тут не годиться: тест на порожній чат передає саме null.
      lastMessageText:
        over.lastMessageText === undefined ? 'Привіт' : over.lastMessageText,
      lastMessageAt:
        over.lastMessageAt === undefined
          ? new Date('2026-03-15T11:00:00Z')
          : over.lastMessageAt,
      lastSenderId: over.lastSenderId ?? 'peer-1',
      members: peer,
    },
  }
}

/** Аргументи головного запиту. */
const findArgs = () => prisma.chatMember.findMany.mock.calls[0][0]
/** where лічильника непрочитаних. */
const groupWhere = () => prisma.message.groupBy.mock.calls[0][0].where

beforeEach(() => {
  resetPrisma()
  prisma.chatMember.findMany.mockResolvedValue([])
  prisma.message.groupBy.mockResolvedValue([])
})

describe('запит за чатами', () => {
  it('бере лише свої членства', async () => {
    await loadChatsForUser(USER)

    expect(findArgs().where).toEqual({ userId: USER })
  })

  // Без стелі запит росте разом з історією: у юзера з двома роками
  // листування це сотні рядків з вкладеними профілями на КОЖЕН вхід
  // у дашборд.
  it('на кількість чатів є стеля', async () => {
    await loadChatsForUser(USER)

    expect(findArgs().take).toBeGreaterThan(0)
    expect(findArgs().take).toBeLessThanOrEqual(100)
  })

  // Зріз має сенс лише разом із сортуванням: інакше він відрізав би
  // випадкові чати, а не найстаріший хвіст.
  it('сортує за свіжістю останнього повідомлення', async () => {
    await loadChatsForUser(USER)

    expect(findArgs().orderBy).toEqual({ chat: { lastMessageAt: 'desc' } })
  })

  it('співрозмовника шукає серед НЕ-себе і бере одного', async () => {
    await loadChatsForUser(USER)

    const members = findArgs().select.chat.select.members
    expect(members.where).toEqual({ userId: { not: USER } })
    expect(members.take).toBe(1)
  })

  // Маніфест: контакти закриті до угоди. Телефон живе лише там, де вже є
  // Order і глядач — його учасник. Список чатів такою перевіркою не
  // займається, тож поля тут просто бути не повинно.
  it('у вибірці співрозмовника немає телефону й пошти', async () => {
    await loadChatsForUser(USER)

    const userSelect = findArgs().select.chat.select.members.select.user.select

    expect(userSelect.phone).toBeUndefined()
    expect(userSelect.email).toBeUndefined()
    expect(Object.keys(userSelect).sort()).toEqual([
      'avatar',
      'id',
      'masterProfile',
      'name',
      'username',
    ])
  })
})

describe('лічильник непрочитаних', () => {
  it('без чатів другого запиту немає взагалі', async () => {
    const result = await loadChatsForUser(USER)

    expect(result).toEqual([])
    expect(prisma.message.groupBy).not.toHaveBeenCalled()
  })

  // N+1 тут коштував би по запиту на чат при кожному відкритті дашборда.
  it('усі непрочитані рахуються одним groupBy', async () => {
    prisma.chatMember.findMany.mockResolvedValue([
      membership({ id: 'c1' }),
      membership({ id: 'c2' }),
      membership({ id: 'c3' }),
    ])

    await loadChatsForUser(USER)

    expect(prisma.message.groupBy).toHaveBeenCalledTimes(1)
    expect(groupWhere().chatId).toEqual({ in: ['c1', 'c2', 'c3'] })
  })

  it('свої повідомлення бейдж не накручують', async () => {
    prisma.chatMember.findMany.mockResolvedValue([membership()])

    await loadChatsForUser(USER)

    expect(groupWhere().senderId).toEqual({ not: USER })
  })

  // Системні події замовлення більше не повідомлення. Рядки зі старих
  // чатів лишились, і без цього фільтра бейдж світився б вічно.
  it('системні рядки виключені', async () => {
    prisma.chatMember.findMany.mockResolvedValue([membership()])

    await loadChatsForUser(USER)

    expect(groupWhere().type).toEqual({ not: 'SYSTEM' })
  })

  it('видалені й прочитані не рахуються', async () => {
    prisma.chatMember.findMany.mockResolvedValue([membership()])

    await loadChatsForUser(USER)

    expect(groupWhere().deletedAt).toBeNull()
    expect(groupWhere().isRead).toBe(false)
  })

  it('число з groupBy лягає у свій чат', async () => {
    prisma.chatMember.findMany.mockResolvedValue([
      membership({ id: 'c1' }),
      membership({ id: 'c2' }),
    ])
    prisma.message.groupBy.mockResolvedValue([
      { chatId: 'c2', _count: { _all: 7 } },
    ])

    const [first, second] = await loadChatsForUser(USER)

    expect(first.unreadCount).toBe(0)
    expect(second.unreadCount).toBe(7)
  })

  it('чат без рядка в groupBy отримує нуль, а не undefined', async () => {
    prisma.chatMember.findMany.mockResolvedValue([membership()])

    const [chat] = await loadChatsForUser(USER)

    expect(chat.unreadCount).toBe(0)
  })
})

describe('форма відповіді', () => {
  it('дати віддаються рядками ISO — їх серіалізує SSR', async () => {
    prisma.chatMember.findMany.mockResolvedValue([membership()])

    const [chat] = await loadChatsForUser(USER)

    expect(chat.updatedAt).toBe('2026-03-15T12:00:00.000Z')
    expect(chat.lastMessageAt).toBe('2026-03-15T11:00:00.000Z')
  })

  it('чат без жодного повідомлення не ламає серіалізацію', async () => {
    prisma.chatMember.findMany.mockResolvedValue([
      membership({ lastMessageAt: null, lastMessageText: null }),
    ])

    const [chat] = await loadChatsForUser(USER)

    expect(chat.lastMessageAt).toBeNull()
    expect(chat.lastMessageText).toBeNull()
  })

  it('імені немає — порожній рядок, не null', async () => {
    prisma.chatMember.findMany.mockResolvedValue([
      membership({ peer: { name: null } }),
    ])

    const [chat] = await loadChatsForUser(USER)

    expect(chat.peer.name).toBe('')
  })

  it('галочка тільки у VERIFIED', async () => {
    for (const [status, expected] of [
      ['VERIFIED', true],
      ['PENDING', false],
      ['REJECTED', false],
    ] as const) {
      resetPrisma()
      prisma.message.groupBy.mockResolvedValue([])
      prisma.chatMember.findMany.mockResolvedValue([
        membership({ peer: { masterProfile: { verificationStatus: status } } }),
      ])

      const [chat] = await loadChatsForUser(USER)
      expect(chat.peer.isVerified, status).toBe(expected)
    }
  })

  it('клієнт без masterProfile — просто без галочки', async () => {
    prisma.chatMember.findMany.mockResolvedValue([
      membership({ peer: { masterProfile: null } }),
    ])

    const [chat] = await loadChatsForUser(USER)

    expect(chat.peer.isVerified).toBe(false)
  })

  // Захист від падіння на members[0]: чат може лишитись без другого
  // учасника (акаунт видалили) — такий рядок просто не показуємо.
  it('чат без співрозмовника відкидається, а не роняє список', async () => {
    prisma.chatMember.findMany.mockResolvedValue([
      membership({ id: 'broken', peer: null }),
      membership({ id: 'ok' }),
    ])

    const chats = await loadChatsForUser(USER)

    expect(chats.map((c) => c.id)).toEqual(['ok'])
  })

  it('телефон не з’являється у відповіді навіть якщо база його поверне', async () => {
    prisma.chatMember.findMany.mockResolvedValue([
      membership({ peer: { phone: '+380991234567' } }),
    ])

    const [chat] = await loadChatsForUser(USER)

    expect(JSON.stringify(chat)).not.toContain('380991234567')
    expect(Object.keys(chat.peer).sort()).toEqual([
      'avatar',
      'id',
      'isVerified',
      'name',
      'username',
    ])
  })

  it('порядок із бази зберігається — сортування не переграється в пам’яті', async () => {
    prisma.chatMember.findMany.mockResolvedValue([
      membership({ id: 'c1' }),
      membership({ id: 'c2' }),
      membership({ id: 'c3' }),
    ])

    const chats = await loadChatsForUser(USER)

    expect(chats.map((c) => c.id)).toEqual(['c1', 'c2', 'c3'])
  })
})
