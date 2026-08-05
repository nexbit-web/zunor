import { describe, it, expect } from 'vitest'
import { sanitizeJobTitle, sanitizeJobDescription } from './job-copy'

// Вхід — недовірений: вивід LLM або тіло POST. Контракт простий: або
// чистий рядок у межах лімітів, або null (викликач підставить шаблон).
//
// Керуючі символи будуємо через fromCharCode, а не пишемо в літералі:
// у коді вони невидимі, і тест ставав би нечитним.

const BELL = String.fromCharCode(7)
const NUL = String.fromCharCode(0)

function hasControl(s: string, allowNewline = false): boolean {
  return [...s].some((ch) => {
    const c = ch.charCodeAt(0)
    if (allowNewline && c === 10) return false
    return c < 0x20 || c === 0x7f
  })
}

describe('sanitizeJobTitle', () => {
  it('не-рядок → null', () => {
    for (const bad of [null, undefined, 42, {}, []] as unknown[]) {
      expect(sanitizeJobTitle(bad)).toBeNull()
    }
  })

  it('надто коротка назва → null, а не обрізок', () => {
    expect(sanitizeJobTitle('Мало')).toBeNull()
    expect(sanitizeJobTitle('   ')).toBeNull()
  })

  it('нормальна назва проходить як є', () => {
    expect(sanitizeJobTitle('Генеральне прибирання квартири')).toBe(
      'Генеральне прибирання квартири',
    )
  })

  it('переводи рядків схлопуються — назва однорядкова', () => {
    expect(sanitizeJobTitle('Прибирання\nквартири\nтерміново')).toBe(
      'Прибирання квартири терміново',
    )
  })

  it('керуючі символи вичищаються', () => {
    const out = sanitizeJobTitle(`Прибирання${BELL} ${NUL}квартири`)!
    expect(hasControl(out)).toBe(false)
    expect(out).toBe('Прибирання квартири')
  })

  it('довга назва ріжеться по межі слова, не посеред нього', () => {
    const long =
      'Генеральне прибирання великої трикімнатної квартири після ремонту з миттям вікон і балкона'
    const out = sanitizeJobTitle(long)!
    expect(out.length).toBeLessThanOrEqual(80)
    expect(out.endsWith(' ')).toBe(false)
    // Останнє слово має лишитись цілим — тобто зустрічатись в оригіналі
    const lastWord = out.slice(out.lastIndexOf(' ') + 1)
    expect(long).toContain(lastWord)
  })
})

describe('sanitizeJobDescription', () => {
  it('не-рядок → null', () => {
    expect(sanitizeJobDescription(null)).toBeNull()
    expect(sanitizeJobDescription(123)).toBeNull()
  })

  it('надто короткий опис → null', () => {
    expect(sanitizeJobDescription('Коротко')).toBeNull()
  })

  it('зберігає абзаци — на відміну від назви', () => {
    expect(sanitizeJobDescription('Перший абзац.\n\nДругий абзац.')).toBe(
      'Перший абзац.\n\nДругий абзац.',
    )
  })

  it('зайві порожні рядки схлопуються до одного розриву абзацу', () => {
    expect(sanitizeJobDescription('Перший абзац.\n\n\n\n\nДругий абзац.')).toBe(
      'Перший абзац.\n\nДругий абзац.',
    )
  })

  it('ріжеться на 2000 символів', () => {
    expect(sanitizeJobDescription('я'.repeat(5000))).toHaveLength(2000)
  })

  it('керуючі символи вичищаються, переводи рядків лишаються', () => {
    const out = sanitizeJobDescription(
      `Опис${BELL} із деталями.\nДруге речення.`,
    )!
    expect(hasControl(out, true)).toBe(false)
    expect(out).toContain('\n')
  })
})
