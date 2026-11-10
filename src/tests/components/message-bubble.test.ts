import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
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
    reactions: [],
    linkPreview: null,
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
    expect(theirs.container.innerHTML).toContain('bg-bubble-in')
  })

  // Градієнт, як в iMessage, — лише на своїх: чужі лишаються картками.
  it('градієнт — лише на своєму', () => {
    const mine = bubble({}, { isMine: true })
    const theirs = bubble({}, { isMine: false })

    expect(mine.container.querySelector('.bubble-mine')).not.toBeNull()
    expect(theirs.container.querySelector('.bubble-mine')).toBeNull()
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

describe('реакції', () => {
  const REACTED = {
    reactions: [
      { emoji: '❤️', userIds: ['me'] },
      { emoji: '👍', userIds: ['peer-1', 'x'] },
    ],
  }

  it('показуються чипами, моя — натиснута', () => {
    const { container } = bubble(REACTED, { currentUserId: 'me' })

    const mine = container.querySelector('[aria-pressed="true"]')
    expect(mine?.textContent).toContain('❤️')
    // Кількість — лише коли реакцій більше однієї.
    expect(container.textContent).toContain('2')
  })

  it('дотик по чипу передає емодзі вікну', async () => {
    const onReact = vi.fn()
    const { container } = bubble(REACTED, { currentUserId: 'me', onReact })

    await fireEvent.click(container.querySelector('[aria-pressed="true"]')!)
    expect(onReact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'msg-1' }),
      '❤️',
    )
  })

  // На видалене реагувати нема на що — і старі реакції зникають разом із ним.
  it('у видаленого реакцій немає', () => {
    const { container } = bubble({
      ...REACTED,
      deletedAt: new Date().toISOString(),
    })

    expect(container.textContent).not.toContain('❤️')
  })

  it('поки летить — реагувати не можна', () => {
    const { container } = bubble(REACTED, {
      isMine: true,
      isPending: true,
      onReact: vi.fn(),
    })

    for (const b of container.querySelectorAll('[aria-pressed]')) {
      expect((b as HTMLButtonElement).disabled).toBe(true)
    }
  })
})

describe('посилання', () => {
  it('адреса в тексті — посилання, що відкривається безпечно', () => {
    const { container } = bubble({ text: 'План: https://example.com/a.pdf' })

    const a = container.querySelector('a[href="https://example.com/a.pdf"]')!
    expect(a).not.toBeNull()
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toContain('noopener')
    expect(a.getAttribute('rel')).toContain('nofollow')
  })

  it('javascript: лишається текстом', () => {
    const { container } = bubble({ text: 'javascript:alert(1)' })

    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toContain('javascript:alert(1)')
  })
})

describe('картка посилання', () => {
  const linkPreview = {
    url: 'https://pb.ua/short?5Z1QZ',
    siteName: 'next.privat24.ua',
    title: 'Інтернет-банк, доступний кожному',
    description: 'Усі фінансові послуги за кілька кліків',
  }
  const withCard = (over: Partial<ChatMessage> = {}) =>
    bubble({ text: 'Оплата: https://pb.ua/short?5Z1QZ', linkPreview, ...over })

  it('сайт, заголовок і опис під текстом', () => {
    const { container } = withCard()

    expect(container.textContent).toContain('next.privat24.ua')
    expect(container.textContent).toContain('Інтернет-банк, доступний кожному')
    expect(container.textContent).toContain('Усі фінансові послуги')
  })

  it('картка веде на посилання з тексту й відкривається безпечно', () => {
    const { container } = withCard()

    const card = [
      ...container.querySelectorAll('a[href="https://pb.ua/short?5Z1QZ"]'),
    ].find((a) => a.textContent?.includes('next.privat24.ua'))!
    expect(card).toBeDefined()
    expect(card.getAttribute('target')).toBe('_blank')
    expect(card.getAttribute('rel')).toContain('noopener')
    expect(card.getAttribute('rel')).toContain('nofollow')
  })

  it('картинок у картці немає — їх вантажив би браузер співрозмовника', () => {
    const { container } = withCard()
    expect(container.querySelector('img')).toBeNull()
  })

  it('час один — під карткою, а не двічі', () => {
    const { getAllByText } = withCard({
      createdAt: '2026-03-15T14:05:00.000Z',
    })
    const time = new Date('2026-03-15T14:05:00.000Z').toLocaleTimeString(
      'uk-UA',
      { hour: '2-digit', minute: '2-digit' },
    )
    expect(getAllByText(time)).toHaveLength(1)
  })

  it('у видаленого картки немає', () => {
    const { container } = withCard({
      text: '',
      deletedAt: new Date().toISOString(),
    })
    expect(container.textContent).not.toContain('next.privat24.ua')
  })
})

describe('перехід до цитати', () => {
  const QUOTED = {
    replyToId: 'old',
    replyTo: {
      id: 'old',
      text: 'Ось адреса',
      senderId: 'me',
      type: 'TEXT' as const,
    },
  }

  it('клік по цитаті веде до оригіналу', async () => {
    const onJumpTo = vi.fn()
    const { getByText } = bubble(QUOTED, { onJumpTo })

    await fireEvent.click(getByText('Ось адреса'))
    expect(onJumpTo).toHaveBeenCalledWith('old')
  })

  // Сервер не віддає текст видаленого навіть у цитаті — показуємо, чому.
  it('цитата видаленого — «Повідомлення видалено»', () => {
    const { container } = bubble({
      ...QUOTED,
      replyTo: { ...QUOTED.replyTo, text: '' },
    })

    expect(container.textContent).toContain('Повідомлення видалено')
  })
})

// Фото без підпису — без бульбашки, як у Telegram: залите тло давало
// навколо знімка товсту рамку кольору акценту. З підписом бульбашка
// лишається — тексту потрібне тло.
describe('фото без бульбашки', () => {
  const PHOTO = {
    type: 'PHOTO' as const,
    attachmentUrl: 'https://res.cloudinary.com/demo/a.jpg',
  }

  it('своє фото без підпису — без заливки й хвостика', () => {
    const { container } = bubble(
      { ...PHOTO, text: '' },
      { isMine: true, isLastInGroup: true },
    )
    const el = container.querySelector('.bubble')!

    expect(el.classList.contains('bubble-mine')).toBe(false)
    expect(el.classList.contains('bg-primary')).toBe(false)
    expect(el.classList.contains('tail-out')).toBe(false)
  })

  it('з підписом бульбашка повертається', () => {
    const { container } = bubble(
      { ...PHOTO, text: 'Ось кухня' },
      { isMine: true, isLastInGroup: true },
    )
    const el = container.querySelector('.bubble')!

    expect(el.classList.contains('bubble-mine')).toBe(true)
    expect(el.classList.contains('tail-out')).toBe(true)
  })
})

describe('фото в галереї чату', () => {
  it('фото позначене для галереї (PhotoSwipe у вікні чату)', () => {
    const { container } = bubble({
      type: 'PHOTO',
      attachmentUrl: 'https://res.cloudinary.com/demo/a.jpg',
      text: '',
    })

    expect(container.querySelector('a[data-pswp]')).not.toBeNull()
  })
})
