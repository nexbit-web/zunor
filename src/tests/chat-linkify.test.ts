import { describe, it, expect } from 'vitest'
import { firstLink, linkify } from '$lib/components/chat/linkify'

// Посилання в повідомленнях. Розмітку малює компонент — тут перевіряється,
// ЩО стає посиланням: лише http(s) і www., без хвостової пунктуації.

const links = (text: string) =>
  linkify(text)
    .filter((p) => p.kind === 'link')
    .map((p) => (p.kind === 'link' ? p.href : ''))

describe('посилання в тексті', () => {
  it('http(s) стає посиланням, текст навколо лишається текстом', () => {
    expect(linkify('План: https://example.com/a.pdf — дивіться')).toEqual([
      { kind: 'text', value: 'План: ' },
      {
        kind: 'link',
        value: 'https://example.com/a.pdf',
        href: 'https://example.com/a.pdf',
      },
      { kind: 'text', value: ' — дивіться' },
    ])
  })

  it('www. отримує https://', () => {
    expect(links('сайт www.zunor.org')).toEqual(['https://www.zunor.org'])
  })

  it('крапка й кома в кінці речення — не частина адреси', () => {
    expect(links('Ось https://a.com/x, і ще https://b.com.')).toEqual([
      'https://a.com/x',
      'https://b.com',
    ])
  })

  it('дужка в адресі лишається, якщо відкрита в ній самій', () => {
    expect(links('https://uk.wikipedia.org/wiki/Одеса_(місто)')).toEqual([
      'https://uk.wikipedia.org/wiki/Одеса_(місто)',
    ])
    expect(links('(див. https://a.com)')).toEqual(['https://a.com'])
  })

  // Небезпечні схеми лишаються текстом, навіть якщо їх написали.
  it('javascript: і data: — не посилання', () => {
    expect(links('javascript:alert(1)')).toEqual([])
    expect(links('data:text/html,<script>alert(1)</script>')).toEqual([])
  })

  it('кириличний текст без адрес — один шматок тексту', () => {
    expect(linkify('Привіт, коли зручно?')).toEqual([
      { kind: 'text', value: 'Привіт, коли зручно?' },
    ])
  })

  it('порожній рядок — порожньо', () => {
    expect(linkify('')).toEqual([])
  })

  // Для нього сервер робить картку — правило те саме, що й клікабельність.
  it('firstLink — перше посилання, вже з https://', () => {
    expect(firstLink('Ось www.zunor.org і https://b.com')).toBe(
      'https://www.zunor.org',
    )
    expect(firstLink('без посилань, javascript:alert(1)')).toBeNull()
  })

  it('текст склеюється назад без втрат', () => {
    const text = 'a https://x.com/y. b www.q.ua, c'
    expect(
      linkify(text)
        .map((p) => p.value)
        .join(''),
    ).toBe(text)
  })
})
