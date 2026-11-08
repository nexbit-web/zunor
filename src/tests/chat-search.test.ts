import { describe, it, expect } from 'vitest'
import {
  SEARCH_LIMIT,
  searchMessages,
  searchSnippet,
} from '$lib/components/chat/search'
import { formatChatTime } from '$lib/components/chat/calendar-time'
import type { ChatMessage } from '$lib/components/chat/types'

// Пошук у чаті: що знаходиться, у якому порядку й що показати в рядку
// списку. Розмітку малює шапка — тут дані.

function msg(id: string, text: string, over: Partial<ChatMessage> = {}) {
  return {
    id,
    type: 'TEXT',
    text,
    attachmentUrl: null,
    attachmentMimeType: null,
    attachmentSize: null,
    attachmentName: null,
    isRead: true,
    editedAt: null,
    deletedAt: null,
    createdAt: '2026-10-30T10:00:00.000Z',
    senderId: 'peer',
    replyToId: null,
    replyTo: null,
    reactions: [],
    linkPreview: null,
    ...over,
  } satisfies ChatMessage
}

// Стрічка в чаті — від старого до нового, як у вікні.
const feed = [
  msg('1', 'Доброго дня! Коли зручно прийти?'),
  msg('2', 'Завтра о 10:00 зручно'),
  msg('3', 'секрет про ключі', { deletedAt: '2026-10-30T11:00:00.000Z' }),
  msg('4', 'Ключі залишу в сусідки'),
  msg('5', ''),
]

describe('що знаходиться', () => {
  it('без урахування регістру, від найновішого', () => {
    expect(searchMessages(feed, 'ЗРУЧНО').map((m) => m.id)).toEqual(['2', '1'])
  })

  it('видалене не знаходиться навіть за старим текстом', () => {
    expect(searchMessages(feed, 'секрет')).toEqual([])
    expect(searchMessages(feed, 'ключі').map((m) => m.id)).toEqual(['4'])
  })

  it('порожній чи з пробілів запит — нічого', () => {
    expect(searchMessages(feed, '')).toEqual([])
    expect(searchMessages(feed, '   ')).toEqual([])
  })

  it('пробіли довкола запиту не заважають', () => {
    expect(searchMessages(feed, '  сусідки ').map((m) => m.id)).toEqual(['4'])
  })

  it('список має стелю', () => {
    const many = Array.from({ length: SEARCH_LIMIT + 50 }, (_, i) =>
      msg(String(i), 'прибирання'),
    )
    const found = searchMessages(many, 'прибирання')
    expect(found).toHaveLength(SEARCH_LIMIT)
    // Стеля зрізає найстаріше, а не найновіше.
    expect(found[0].id).toBe(String(SEARCH_LIMIT + 49))
  })
})

describe('рядок у списку', () => {
  it('збіг виділений, регістр тексту — як написали', () => {
    expect(searchSnippet('Завтра о 10:00 зручно', 'зручно')).toEqual({
      before: 'Завтра о 10:00 ',
      match: 'зручно',
      after: '',
    })
  })

  it('у довгому тексті збіг видно: початок обрізаний з «…»', () => {
    const text = `${'дуже довгий вступ '.repeat(10)}ключі під килимком`
    const s = searchSnippet(text, 'ключі')
    expect(s.match).toBe('ключі')
    expect(s.before.startsWith('…')).toBe(true)
    expect(s.before.length).toBeLessThanOrEqual(25)
  })

  it('переноси рядків стають пробілами', () => {
    expect(searchSnippet('Адреса:\nвул. Дерибасівська', 'вул')).toEqual({
      before: 'Адреса: ',
      match: 'вул',
      after: '. Дерибасівська',
    })
  })
})

describe('календарний час (список чатів і пошук)', () => {
  const now = new Date(2026, 9, 30, 15, 0)

  it('щойно і хвилини', () => {
    expect(
      formatChatTime(new Date(2026, 9, 30, 14, 59, 40).toISOString(), now),
    ).toBe('щойно')
    expect(
      formatChatTime(new Date(2026, 9, 30, 14, 35).toISOString(), now),
    ).toBe('25 хв')
  })

  it('сьогодні — година, учора — «вчора»', () => {
    expect(formatChatTime(new Date(2026, 9, 30, 9, 5).toISOString(), now)).toBe(
      '09:05',
    )
    expect(
      formatChatTime(new Date(2026, 9, 29, 20, 0).toISOString(), now),
    ).toBe('вчора')
  })

  it('давно — дата', () => {
    expect(
      formatChatTime(new Date(2026, 8, 14, 12, 0).toISOString(), now),
    ).toMatch(/14/)
  })

  it('без дати — порожньо', () => {
    expect(formatChatTime(null, now)).toBe('')
  })
})
