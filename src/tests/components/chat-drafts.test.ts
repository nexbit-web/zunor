import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Чернетки повідомлень: своя в кожному чаті, як у Telegram. Стережемо:
//   • недописане одного чату не їде в інший;
//   • двоє людей з одного браузера не бачать чернеток одне одного;
//   • сховище має стелю й переживає перезавантаження сторінки.

const KEY = 'zunor-chat-drafts'

async function freshDrafts() {
  vi.resetModules()
  return (await import('$lib/components/chat/drafts.svelte')).chatDrafts
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('чернетки', () => {
  it('своя в кожному чаті', async () => {
    const drafts = await freshDrafts()
    drafts.set('me', 'chat-a', 'Привіт, коли')
    drafts.set('me', 'chat-b', 'Дякую')

    expect(drafts.get('me', 'chat-a')).toBe('Привіт, коли')
    expect(drafts.get('me', 'chat-b')).toBe('Дякую')
    expect(drafts.get('me', 'chat-c')).toBe('')
  })

  it('чужий користувач того ж браузера чернетки не бачить', async () => {
    const drafts = await freshDrafts()
    drafts.set('client', 'chat-a', 'секрет')

    expect(drafts.get('master', 'chat-a')).toBe('')
  })

  it('порожній текст прибирає чернетку', async () => {
    const drafts = await freshDrafts()
    drafts.set('me', 'chat-a', 'щось')
    drafts.set('me', 'chat-a', '   ')

    expect(drafts.get('me', 'chat-a')).toBe('')
  })

  it('переживає перезавантаження сторінки', async () => {
    const drafts = await freshDrafts()
    drafts.set('me', 'chat-a', 'недописане')
    // Запис гуртом, не на кожну літеру.
    expect(localStorage.getItem(KEY)).toBeNull()
    vi.advanceTimersByTime(500)

    const reloaded = await freshDrafts()
    expect(reloaded.get('me', 'chat-a')).toBe('недописане')
  })

  it('стеля — найстаріші витісняються', async () => {
    const drafts = await freshDrafts()
    for (let i = 0; i < 60; i++) drafts.set('me', `chat-${i}`, `текст ${i}`)
    vi.advanceTimersByTime(500)

    const saved = JSON.parse(localStorage.getItem(KEY)!)
    expect(Object.keys(saved)).toHaveLength(50)
    expect(drafts.get('me', 'chat-0')).toBe('')
    expect(drafts.get('me', 'chat-59')).toBe('текст 59')
  })

  it('битий JSON у сховищі — без чернеток, а не падіння', async () => {
    localStorage.setItem(KEY, '{не json')
    const drafts = await freshDrafts()

    expect(drafts.get('me', 'chat-a')).toBe('')
  })
})
