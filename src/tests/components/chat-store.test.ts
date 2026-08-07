import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getPusher,
  pusher,
  emit,
  handlerCount,
  resetPusher,
  installFetch,
  fetchMock,
  respondWith,
  respondFail,
  respondOffline,
} from './helpers/client-infra'
import type {
  ChatPreview,
  ChatUpdatePayload,
  MessageNewPayload,
} from '$lib/components/chat/types'

const playMessageSound = vi.hoisted(() => vi.fn())

vi.mock('$lib/pusher-client', () => ({ getPusher }))
vi.mock('$lib/sound/notification', () => ({ playMessageSound }))

const { chatStore } = await import('$lib/stores/chat-store.svelte')

// Стор чатів живе паралельно зі стором сповіщень на ТОМУ САМОМУ каналі
// private-user-*. Список чатів і бейдж непрочитаних тепер не приходять із
// серверних лоадерів: раніше це були 3-5 запитів до бази на КОЖНУ навігацію
// дашборда заради даних, які й так є в браузері.
//
// Що тримають тести:
//   • totalUnread — $derived, а не поле, яке хтось мусить не забути
//     перерахувати після мутації списку;
//   • звук не звучить на власні повідомлення й на відкритий чат;
//   • невідомий чат тягне список цілком — інакше нове листування не
//     з'явилось би в сайдбарі до перезавантаження сторінки.

const USER = 'user-1'
const CHANNEL = 'private-user-user-1'

function preview(over: Partial<ChatPreview> = {}): ChatPreview {
  return {
    id: 'chat-1',
    peer: {
      id: 'peer-1',
      name: 'Оля',
      username: 'olya',
      avatar: null,
      isVerified: true,
    },
    lastMessageText: 'Привіт',
    lastMessageAt: '2026-03-15T11:00:00.000Z',
    lastSenderId: 'peer-1',
    unreadCount: 0,
    updatedAt: '2026-03-15T12:00:00.000Z',
    ...over,
  }
}

function update(over: Partial<ChatUpdatePayload> = {}): ChatUpdatePayload {
  return {
    chatId: 'chat-1',
    lastMessageText: 'Нове',
    lastMessageAt: '2026-03-15T13:00:00.000Z',
    lastSenderId: 'peer-1',
    unreadCount: 1,
    ...over,
  }
}

function messagePayload(
  over: { chatId?: string; senderId?: string } = {},
): MessageNewPayload {
  return {
    chatId: over.chatId ?? 'chat-1',
    senderName: 'Оля',
    senderAvatar: null,
    message: {
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
      createdAt: '2026-03-15T13:00:00.000Z',
      senderId: over.senderId ?? 'peer-1',
      replyToId: null,
      replyTo: null,
    },
  }
}

beforeEach(() => {
  resetPusher()
  installFetch()
  playMessageSound.mockClear()
  chatStore.unsubscribeAll()
  chatStore.setChats([])
  chatStore.activeChatId = null
})

describe('лічильник непрочитаних', () => {
  it('складається з усіх чатів', () => {
    chatStore.setChats([
      preview({ id: 'a', unreadCount: 2 }),
      preview({ id: 'b', unreadCount: 3 }),
      preview({ id: 'c', unreadCount: 0 }),
    ])

    expect(chatStore.totalUnread).toBe(5)
  })

  it('порожній список — нуль', () => {
    chatStore.setChats([])

    expect(chatStore.totalUnread).toBe(0)
  })

  // $derived, а не поле з ручним перерахунком: синхронізоване вручну число
  // рано чи пізно розійдеться з джерелом, бо хтось додасть гілку й забуде
  // викликати перерахунок.
  it('перераховується сам після позначки «прочитано»', () => {
    chatStore.setChats([
      preview({ id: 'a', unreadCount: 4 }),
      preview({ id: 'b', unreadCount: 1 }),
    ])

    chatStore.markChatRead('a')

    expect(chatStore.totalUnread).toBe(1)
  })

  it('перераховується сам після вхідного повідомлення', async () => {
    chatStore.setChats([preview({ id: 'a', unreadCount: 0 })])
    await chatStore.subscribeToUserEvents(USER)

    emit(CHANNEL, 'chat:update', update({ chatId: 'a' }))

    expect(chatStore.totalUnread).toBe(1)
  })

  it('позначка вже прочитаного чату нічого не ламає', () => {
    chatStore.setChats([preview({ id: 'a', unreadCount: 0 })])

    chatStore.markChatRead('a')

    expect(chatStore.totalUnread).toBe(0)
  })

  it('позначка невідомого чату не роняє стор', () => {
    chatStore.setChats([preview({ id: 'a', unreadCount: 1 })])

    expect(() => chatStore.markChatRead('немає-такого')).not.toThrow()
    expect(chatStore.totalUnread).toBe(1)
  })
})

describe('підписка', () => {
  it('слухає chat:update і message:new на особистому каналі', async () => {
    await chatStore.subscribeToUserEvents(USER)

    expect(pusher.subscribe).toHaveBeenCalledWith(CHANNEL)
    expect(handlerCount(CHANNEL, 'chat:update')).toBe(1)
    expect(handlerCount(CHANNEL, 'message:new')).toBe(1)
  })

  it('повторний виклик того самого юзера не подвоює обробники', async () => {
    await chatStore.subscribeToUserEvents(USER)
    await chatStore.subscribeToUserEvents(USER)

    expect(handlerCount(CHANNEL, 'chat:update')).toBe(1)
  })

  it('вихід чистить список і лічильник', async () => {
    chatStore.setChats([preview({ unreadCount: 3 })])
    await chatStore.subscribeToUserEvents(USER)

    chatStore.unsubscribeAll()

    expect(chatStore.totalUnread).toBe(0)
    expect(chatStore.initialized).toBe(false)
  })

  it('вихід без підписки нічого не робить', () => {
    expect(() => chatStore.unsubscribeAll()).not.toThrow()
    expect(pusher.unsubscribe).not.toHaveBeenCalled()
  })

  // ⚠️ ЗАРЯДЖЕНІ ГРАБЛІ, а не баг сьогодні.
  //
  // Канал private-user-* спільний зі стором сповіщень, і той навмисно
  // робить unbind, а не unsubscribe — щоб не вимкнути сусіда. Тут же
  // виклик unsubscribe, тобто канал гасне цілком разом зі сповіщеннями.
  //
  // Зараз це безпечно: unsubscribeAll кличуть лише при виході з акаунта
  // (user-menu, settings/account), а там сторінка однаково перезавантажується.
  // Але щойно хтось покличе його деінде — дзвіночок мовчки перестане
  // працювати, і зв'язок буде неочевидний. Тест фіксує поточну поведінку.
  it('вихід гасить весь канал, включно з чужими підписками', async () => {
    await chatStore.subscribeToUserEvents(USER)

    chatStore.unsubscribeAll()

    expect(pusher.unsubscribe).toHaveBeenCalledWith(CHANNEL)
  })
})

describe('оновлення чату', () => {
  beforeEach(async () => {
    chatStore.setChats([
      preview({ id: 'chat-1', unreadCount: 0 }),
      preview({ id: 'chat-2', unreadCount: 0 }),
    ])
    await chatStore.subscribeToUserEvents(USER)
  })

  it('превʼю оновлюється текстом останнього повідомлення', () => {
    emit(CHANNEL, 'chat:update', update({ lastMessageText: 'Уже їду' }))

    const chat = chatStore.chats.find((c) => c.id === 'chat-1')!
    expect(chat.lastMessageText).toBe('Уже їду')
    expect(chat.lastMessageAt).toBe('2026-03-15T13:00:00.000Z')
    expect(chat.lastSenderId).toBe('peer-1')
  })

  it('чат зі свіжим повідомленням підіймається нагору', () => {
    emit(CHANNEL, 'chat:update', update({ chatId: 'chat-2' }))

    expect(chatStore.chats.map((c) => c.id)).toEqual(['chat-2', 'chat-1'])
  })

  it('чат не дублюється при підйомі нагору', () => {
    emit(CHANNEL, 'chat:update', update({ chatId: 'chat-2' }))
    emit(CHANNEL, 'chat:update', update({ chatId: 'chat-2' }))

    expect(chatStore.chats).toHaveLength(2)
  })

  it('повідомлення від співрозмовника піднімає лічильник', () => {
    emit(CHANNEL, 'chat:update', update({ lastSenderId: 'peer-1' }))

    expect(chatStore.chats.find((c) => c.id === 'chat-1')!.unreadCount).toBe(1)
  })

  // Ехо власного повідомлення приходить тим самим каналом — рахувати його
  // означало б показувати непрочитане самому собі.
  it('власне повідомлення лічильник не чіпає', () => {
    emit(CHANNEL, 'chat:update', update({ lastSenderId: USER }))

    expect(chatStore.chats.find((c) => c.id === 'chat-1')!.unreadCount).toBe(0)
  })

  it('відкритий чат лічильник не накручує', () => {
    chatStore.activeChatId = 'chat-1'

    emit(CHANNEL, 'chat:update', update({ chatId: 'chat-1' }))

    expect(chatStore.chats.find((c) => c.id === 'chat-1')!.unreadCount).toBe(0)
  })

  it('сусідній чат при відкритому лічильник накручує', () => {
    chatStore.activeChatId = 'chat-1'

    emit(CHANNEL, 'chat:update', update({ chatId: 'chat-2' }))

    expect(chatStore.chats.find((c) => c.id === 'chat-2')!.unreadCount).toBe(1)
  })

  // Перше повідомлення в новому чаті: превʼю в сторі ще немає, і без
  // перезавантаження списку воно не з'явилось би в сайдбарі взагалі.
  it('невідомий чат тягне список цілком', async () => {
    respondWith({ chats: [preview({ id: 'chat-new' })] })

    emit(CHANNEL, 'chat:update', update({ chatId: 'chat-new' }))

    await vi.waitFor(() =>
      expect(chatStore.chats.some((c) => c.id === 'chat-new')).toBe(true),
    )
    expect(fetchMock).toHaveBeenCalledWith('/api/chats')
  })
})

describe('звук вхідного повідомлення', () => {
  beforeEach(async () => {
    chatStore.setChats([preview({ id: 'chat-1' }), preview({ id: 'chat-2' })])
    await chatStore.subscribeToUserEvents(USER)
  })

  it('звучить, коли чат закритий', () => {
    emit(CHANNEL, 'message:new', messagePayload({ chatId: 'chat-2' }))

    expect(playMessageSound).toHaveBeenCalledTimes(1)
  })

  // Інакше кожне власне повідомлення дзвеніло б у вухо тому, хто його щойно
  // надіслав.
  it('на власне повідомлення мовчить', () => {
    emit(CHANNEL, 'message:new', messagePayload({ senderId: USER }))

    expect(playMessageSound).not.toHaveBeenCalled()
  })

  // Відкритий чат звучить сам (chat-window), інакше було б два звуки.
  it('на відкритий чат мовчить', () => {
    chatStore.activeChatId = 'chat-1'

    emit(CHANNEL, 'message:new', messagePayload({ chatId: 'chat-1' }))

    expect(playMessageSound).not.toHaveBeenCalled()
  })
})

describe('завантаження списку', () => {
  it('один запит за сесію, не на кожну навігацію', async () => {
    respondWith({ chats: [preview({ id: 'a' }), preview({ id: 'b' })] })

    await chatStore.refreshChats()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(chatStore.chats).toHaveLength(2)
    expect(chatStore.initialized).toBe(true)
  })

  it('відповідь без поля chats не роняє стор', async () => {
    respondWith({})

    await chatStore.refreshChats()

    expect(chatStore.chats).toEqual([])
  })

  it('помилка сервера лишає список як був', async () => {
    chatStore.setChats([preview({ id: 'a' })])
    respondFail(500)

    await chatStore.refreshChats()

    expect(chatStore.chats.map((c) => c.id)).toEqual(['a'])
  })

  it('немає мережі — без винятку назовні', async () => {
    respondOffline()

    await expect(chatStore.refreshChats()).resolves.toBeUndefined()
  })
})
