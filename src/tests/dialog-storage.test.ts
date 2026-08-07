import { describe, it, expect, beforeEach, vi } from 'vitest'

// $app/environment у vitest немає — підміняємо, бо конфіг навмисно без
// плагіна sveltekit (див. «Тести» в AGENTS.md).
vi.mock('$app/environment', () => ({ browser: true }))

// Мінімальний localStorage: у vitest середовище 'node', вбудованого немає.
class MemoryStorage {
  private data = new Map<string, string>()
  getItem(k: string): string | null {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v)
  }
  removeItem(k: string): void {
    this.data.delete(k)
  }
  get size(): number {
    return this.data.size
  }
}

let storage: MemoryStorage

beforeEach(async () => {
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  vi.unstubAllEnvs()
})

const { saveDialog, loadDialog, clearDialog } =
  await import('$lib/zunor/dialog-storage')

function dialog(overrides = {}) {
  return {
    messages: [
      { id: 0, role: 'user' as const, text: 'Прибрати квартиру' },
      {
        id: 1,
        role: 'zunor' as const,
        text: 'Скільки кімнат?',
        shown: 3,
        typing: true,
        thinkSeconds: 2,
      },
    ],
    chips: ['1', '2', '3'],
    sentPhotos: [{ url: 'https://res.cloudinary.com/a.jpg', publicId: 'a' }],
    pendingPhotos: [],
    nextMsgId: 2,
    ...overrides,
  }
}

describe('dialog-storage', () => {
  it('повертає збережений діалог після «перезавантаження»', () => {
    saveDialog('user-1', dialog())
    const loaded = loadDialog('user-1')

    expect(loaded).not.toBeNull()
    expect(loaded!.messages).toHaveLength(2)
    expect(loaded!.chips).toEqual(['1', '2', '3'])
    expect(loaded!.sentPhotos[0].publicId).toBe('a')
    expect(loaded!.nextMsgId).toBe(2)
  })

  // Друкарка — стан рендера. Якби shown зберігався як є, після відновлення
  // репліка назавжди лишилась би обрізаною на трьох символах.
  it('відновлює репліки агента повністю надрукованими', () => {
    saveDialog('user-1', dialog())
    const msg = loadDialog('user-1')!.messages[1]

    expect(msg.role).toBe('zunor')
    if (msg.role !== 'zunor') return
    expect(msg.shown).toBe(msg.text.length)
    expect(msg.typing).toBe(false)
  })

  // Головна вимога приватності: спільний комп'ютер.
  it('не віддає діалог іншому користувачу', () => {
    saveDialog('user-1', dialog())
    expect(loadDialog('user-2')).toBeNull()
  })

  it('після clearDialog нічого не лишається', () => {
    saveDialog('user-1', dialog())
    clearDialog('user-1')
    expect(loadDialog('user-1')).toBeNull()
  })

  it('не віддає діалог, старший за добу, і прибирає його', () => {
    saveDialog('user-1', dialog())

    const dayAndABit = Date.now() + 25 * 60 * 60_000
    vi.spyOn(Date, 'now').mockReturnValue(dayAndABit)

    expect(loadDialog('user-1')).toBeNull()
    expect(storage.size).toBe(0)
    vi.restoreAllMocks()
  })

  it('переживає пошкоджений запис і чистить його', () => {
    storage.setItem('zunor:dialog:user-1', '{не json')
    expect(loadDialog('user-1')).toBeNull()
    expect(storage.size).toBe(0)
  })

  it('ігнорує запис іншої версії формату', () => {
    storage.setItem(
      'zunor:dialog:user-1',
      JSON.stringify({ v: 99, savedAt: Date.now(), messages: [{ id: 0 }] }),
    )
    expect(loadDialog('user-1')).toBeNull()
  })

  it('порожній діалог не вважається збереженим', () => {
    saveDialog('user-1', dialog({ messages: [] }))
    expect(loadDialog('user-1')).toBeNull()
  })

  // Квота localStorage спільна на весь домен — один діалог не має її з'їсти.
  it('не зберігає діалог, більший за ліміт', () => {
    const huge = dialog({
      messages: [
        { id: 0, role: 'user' as const, text: 'x'.repeat(300 * 1024) },
      ],
    })
    saveDialog('user-1', huge)
    expect(loadDialog('user-1')).toBeNull()
  })

  it('обрізає надто довгу розмову до останніх реплік', () => {
    const many = Array.from({ length: 90 }, (_, i) => ({
      id: i,
      role: 'user' as const,
      text: `повідомлення ${i}`,
    }))
    saveDialog('user-1', dialog({ messages: many }))

    const loaded = loadDialog('user-1')!
    expect(loaded.messages).toHaveLength(60)
    // Лишились саме ОСТАННІ — вони і є актуальний контекст для моделі.
    expect(loaded.messages[loaded.messages.length - 1].id).toBe(89)
  })

  it('збій сховища не кидає виняток', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {
        throw new Error('SecurityError')
      },
    })

    expect(() => saveDialog('user-1', dialog())).not.toThrow()
    expect(loadDialog('user-1')).toBeNull()
    expect(() => clearDialog('user-1')).not.toThrow()
  })
})
