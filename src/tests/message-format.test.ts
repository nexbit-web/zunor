import { describe, it, expect } from 'vitest'
import { parseInline, parseMessage, plainText } from '$lib/zunor/message-format'

// Розбір відповіді Zunor. Рендер перевіряє components/message-body.test.ts;
// тут — сам протокол, на якому домовляються промпт, сервер і компонент.

describe('жирне', () => {
  it('**слово** стає напівжирним шматком', () => {
    expect(parseInline('Прибирання **завтра** о 10')).toEqual([
      { text: 'Прибирання ', strong: false },
      { text: 'завтра', strong: true },
      { text: ' о 10', strong: false },
    ])
  })

  // Стрім: модель ще не дописала другу пару зірочок. Сирі «**» блимали б
  // у тексті, доки вона не допише.
  it('незакрите ** під час друку вже жирне, без зірочок', () => {
    expect(parseInline('Обрано **Генер')).toEqual([
      { text: 'Обрано ', strong: false },
      { text: 'Генер', strong: true },
    ])
  })

  it('порожня пара зірочок не дає порожніх шматків', () => {
    expect(parseInline('a****b')).toEqual([
      { text: 'a', strong: false },
      { text: 'b', strong: false },
    ])
  })
})

describe('нумерований список', () => {
  it('рядки «1. » стають нумерованим списком', () => {
    const [block] = parseMessage('1. Кімнати\n2. Дата\n3. Фото')

    expect(block).toMatchObject({ kind: 'list', ordered: true, start: 1 })
    if (block.kind !== 'list') return
    expect(block.items.map((i) => i.spans[0].text)).toEqual([
      'Кімнати',
      'Дата',
      'Фото',
    ])
  })

  it('«1)» теж нумерація', () => {
    const [block] = parseMessage('1) Перше\n2) Друге')
    expect(block).toMatchObject({ kind: 'list', ordered: true })
  })

  // Нумерацію веде список: модель інколи пише «1. 1. 1.».
  it('старт береться з першого пункту, решта номерів — від списку', () => {
    const [block] = parseMessage('3. Третій\n3. Четвертий')
    expect(block).toMatchObject({ kind: 'list', ordered: true, start: 3 })
  })

  it('маркований і нумерований поруч — два різні списки', () => {
    const blocks = parseMessage('— A\n— B\n1. C')

    expect(blocks).toHaveLength(2)
    expect(blocks.map((b) => b.kind === 'list' && b.ordered)).toEqual([
      false,
      true,
    ])
  })

  // Рік чи сума на початку речення — не пункт: потрібні крапка/дужка І
  // пробіл одразу після числа.
  it('«2025 рік» на початку рядка списком не стає', () => {
    expect(parseMessage('2025 рік — гарний')[0].kind).toBe('paragraph')
  })
})

describe('термін у пункті', () => {
  it('жирний термін не тягне зірочки в назву', () => {
    const [block] = parseMessage('— **Генеральне** — глибоке прибирання')

    if (block.kind !== 'list') throw new Error('очікувався список')
    expect(block.items[0].term).toBe('Генеральне')
  })
})

describe('копіювання', () => {
  it('службові зірочки не їдуть у буфер обміну', () => {
    expect(plainText('Дата: **завтра**')).toBe('Дата: завтра')
  })
})
