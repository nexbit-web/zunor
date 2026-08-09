import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import MessageBubble from '$lib/components/chat/message-bubble.svelte'
import type { ChatMessage } from '$lib/components/chat/types'

vi.mock('svelte-hot-french-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

// Бульбашка повідомлення. Логіки в ній більше, ніж здається: видалене,
// відредаговане, цитата, вкладення, статуси доставки — і кожен стан має
// свій вигляд. Ламається це тихо: людина просто бачить не те.
//
// Окремо стережемо два правила:
//   • видалене повідомлення НЕ показує ні тексту, ні вкладення — інакше
//     «видалив» перестає означати «видалив»;
//   • редагувати можна лише СВІЙ текст і лише добу — це правило дублюється
//     на сервері, і розходження між ними виглядало б як загублена правка.

function message(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    type: 'TEXT',
    text: 'Привіт, коли зручно?',
    attachmentUrl: null,
    attachmentMimeType: null,
    attachmentSize: null,
    attachmentName: null,
    isRead: false,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    senderId: 'peer-1',
    replyToId: null,
    replyTo: null,
    ...over,
  }
}

function bubble(over: Partial<ChatMessage> = {}, props: object = {}) {
  return render(MessageBubble, {
    props: {
      message: message(over),
      isMine: false,
      isLastInGroup: true,
      showReadStatus: false,
      isRead: false,
      ...props,
    } as never,
  })
}

const menuButton = (c: HTMLElement) =>
  c.querySelector('[aria-label="Меню повідомлення"]')

describe('текст', () => {
  it('показує повідомлення', () => {
    const { container } = bubble({ text: 'Привіт, коли зручно?' })

    expect(container.textContent).toContain('Привіт, коли зручно?')
  })

  it('час показується коротко', () => {
    const { container } = bubble()

    expect(container.textContent).toMatch(/\d{2}:\d{2}/)
  })

  it('відредаговане підписане', () => {
    const { container } = bubble({ editedAt: new Date().toISOString() })

    expect(container.textContent).toContain('ред.')
  })

  it('нередаговане підпису не має', () => {
    const { container } = bubble()

    expect(container.textContent).not.toContain('ред.')
  })

  // Повідомлення пише інша людина — розмітка в ньому лишається текстом.
  it('розмітка в тексті не виконується', () => {
    const { container } = bubble({ text: '<img src=x onerror=alert(1)>' })

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img')
  })

  it('id повідомлення є в DOM — по ньому скролять до цитати', () => {
    const { container } = bubble({ id: 'msg-42' })

    expect(container.querySelector('[data-message-id="msg-42"]')).not.toBeNull()
  })
})

describe('чиє повідомлення', () => {
  it('своє притиснуте праворуч, чуже — ліворуч', () => {
    const mine = bubble({}, { isMine: true })
    const theirs = bubble({}, { isMine: false })

    expect(mine.container.firstElementChild!.className).toContain('justify-end')
    expect(theirs.container.firstElementChild!.className).toContain(
      'justify-start',
    )
  })

  it('своє й чуже мають різний колір', () => {
    const mine = bubble({}, { isMine: true })
    const theirs = bubble({}, { isMine: false })

    expect(mine.container.innerHTML).toContain('bg-primary')
    expect(theirs.container.innerHTML).toContain('bg-card')
  })

  // Хвостик малюється лише в останнього в групі — інакше серія
  // повідомлень виглядає як окремі репліки.
  it('хвостик тільки в останнього в групі', () => {
    const last = bubble({}, { isLastInGroup: true })
    const middle = bubble({}, { isLastInGroup: false })

    expect(last.container.innerHTML).toContain('tail-in')
    expect(middle.container.innerHTML).not.toContain('tail-in')
  })
})

describe('видалене повідомлення', () => {
  const DELETED = { deletedAt: new Date().toISOString() }

  it('замість тексту — пояснення', () => {
    const { container } = bubble({ ...DELETED, text: 'секрет' })

    expect(container.textContent).toContain('Повідомлення видалено')
    expect(container.textContent).not.toContain('секрет')
  })

  // «Видалив» має означати «видалив»: вкладення теж зникає.
  it('фото не показується', () => {
    const { container } = bubble({
      ...DELETED,
      type: 'PHOTO',
      attachmentUrl: 'https://res.cloudinary.com/demo/a.jpg',
    })

    expect(container.querySelector('img')).toBeNull()
  })

  it('файл не показується', () => {
    const { container } = bubble({
      ...DELETED,
      type: 'FILE',
      attachmentUrl: 'https://res.cloudinary.com/demo/a.pdf',
      attachmentName: 'договір.pdf',
    })

    expect(container.textContent).not.toContain('договір.pdf')
  })

  it('меню дій зникає — правити нічого', () => {
    const { container } = bubble(DELETED)

    expect(menuButton(container)).toBeNull()
  })

  it('час лишається — рядок не має схлопуватись', () => {
    const { container } = bubble(DELETED)

    expect(container.textContent).toMatch(/\d{2}:\d{2}/)
  })
})

describe('вкладення', () => {
  it('фото відкривається в новій вкладці безпечно', () => {
    const { container } = bubble({
      type: 'PHOTO',
      attachmentUrl: 'https://res.cloudinary.com/demo/a.jpg',
      text: '',
    })

    const link = container.querySelector('a')!
    expect(link.getAttribute('href')).toContain('cloudinary')
    expect(link.getAttribute('target')).toBe('_blank')
    // Без rel="noopener" відкрита вкладка отримує доступ до window.opener.
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('підпис під фото показується', () => {
    const { container } = bubble({
      type: 'PHOTO',
      attachmentUrl: 'https://res.cloudinary.com/demo/a.jpg',
      text: 'Ось кухня',
    })

    expect(container.textContent).toContain('Ось кухня')
  })

  it('фото без URL деградує в текст, а не в порожню бульбашку', () => {
    const { container } = bubble({
      type: 'PHOTO',
      attachmentUrl: null,
      text: 'Фото не завантажилось',
    })

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('Фото не завантажилось')
  })

  it('файл показує ім’я і розмір', () => {
    const { container } = bubble({
      type: 'FILE',
      attachmentUrl: 'https://res.cloudinary.com/demo/a.pdf',
      attachmentName: 'договір.pdf',
      attachmentSize: 2_500_000,
    })

    expect(container.textContent).toContain('договір.pdf')
    expect(container.textContent).toContain('2.4 MB')
  })

  it('дрібний файл показується в кілобайтах', () => {
    const { container } = bubble({
      type: 'FILE',
      attachmentUrl: 'https://res.cloudinary.com/demo/a.txt',
      attachmentName: 'нотатка.txt',
      attachmentSize: 4096,
    })

    expect(container.textContent).toContain('4 KB')
  })
})

describe('цитата', () => {
  const reply = {
    replyToId: 'msg-0',
    replyTo: {
      id: 'msg-0',
      text: 'О котрій зручно?',
      senderId: 'peer-1',
      type: 'TEXT' as const,
    },
  }

  it('текст цитати показується', () => {
    const { container } = bubble(reply)

    expect(container.textContent).toContain('О котрій зручно?')
  })

  it('автор цитати підписується, якщо його передали', () => {
    const { container } = bubble(reply, { replyAuthorName: 'Оля' })

    expect(container.textContent).toContain('Оля')
  })

  // Цитувати фото текстом нічого — тому підставляється слово.
  it('цитата фото показується словом «Фото»', () => {
    const { container } = bubble({
      replyToId: 'm0',
      replyTo: { id: 'm0', text: '', senderId: 'p', type: 'PHOTO' },
    })

    expect(container.textContent).toContain('Фото')
  })

  it('цитата файлу — словом «Файл»', () => {
    const { container } = bubble({
      replyToId: 'm0',
      replyTo: { id: 'm0', text: '', senderId: 'p', type: 'FILE' },
    })

    expect(container.textContent).toContain('Файл')
  })

  it('без цитати блоку цитати немає', () => {
    const { container } = bubble()

    expect(container.querySelector('.border-l-\\[3px\\]')).toBeNull()
  })
})

describe('статуси доставки', () => {
  it('поки летить — бульбашка приглушена', () => {
    const { container } = bubble({}, { isMine: true, isPending: true })

    expect(container.innerHTML).toContain('opacity-70')
  })

  it('поки летить, меню дій недоступне', () => {
    const { container } = bubble({}, { isMine: true, isPending: true })

    expect(menuButton(container)).toBeNull()
  })

  it('не долетіло — меню теж недоступне', () => {
    const { container } = bubble({}, { isMine: true, isFailed: true })

    expect(menuButton(container)).toBeNull()
  })

  it('доставлене своє показує меню', () => {
    const { container } = bubble({}, { isMine: true })

    expect(menuButton(container)).not.toBeNull()
  })

  it('підсвічене (пошук) отримує кільце', () => {
    const { container } = bubble({}, { isHighlighted: true })

    expect(container.innerHTML).toContain('ring-2')
  })
})
