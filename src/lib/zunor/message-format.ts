// * мікроформат відповіді асистента → блоки для рендера. Чиста функція, без
// * {@html}: текст моделі лише ділиться на шматки
// *   порожній рядок → межа абзацу
// *   «— пункт»      → маркований список
// *   «1. крок»      → нумерований список
// *   **слово**      → напівжирне (незакрите ** під час друку — відкрите)

export interface Span {
  text: string
  strong: boolean
}

export interface ListItem {
  /** Термін до « — » (пункт форми «Назва — опис»), інакше null. */
  term: string | null
  spans: Span[]
}

export type Block =
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'list'; ordered: false; items: ListItem[] }
  | { kind: 'list'; ordered: true; start: number; items: ListItem[] }

const BULLET = /^— /
const ORDERED = /^(\d{1,2})[.)]\s+/

/** Довший лівий бік — це вже речення з тире посередині, а не термін. */
const MAX_TERM_WORDS = 4

export function parseInline(text: string): Span[] {
  const spans: Span[] = []
  text.split('**').forEach((part, i) => {
    if (part) spans.push({ text: part, strong: i % 2 === 1 })
  })
  return spans
}

// * «Генеральне — глибоке прибирання» → термін «Генеральне»
function listItem(line: string): ListItem {
  const at = line.indexOf(' — ')
  if (at !== -1) {
    const term = line.slice(0, at).replaceAll('**', '').trim()
    if (term && term.split(/\s+/).length <= MAX_TERM_WORDS) {
      return { term, spans: parseInline(line.slice(at + 3).trim()) }
    }
  }
  return { term: null, spans: parseInline(line) }
}

type LineKind = 'text' | 'bullet' | 'ordered'

function kindOf(line: string): LineKind {
  if (BULLET.test(line)) return 'bullet'
  if (ORDERED.test(line)) return 'ordered'
  return 'text'
}

export function parseMessage(text: string): Block[] {
  const out: Block[] = []

  for (const chunk of text.split(/\n{2,}/)) {
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    let group: string[] = []
    let kind: LineKind | null = null

    const flush = () => {
      if (!group.length || !kind) return
      if (kind === 'text') {
        out.push({ kind: 'paragraph', spans: parseInline(group.join(' ')) })
      } else if (kind === 'bullet') {
        out.push({
          kind: 'list',
          ordered: false,
          items: group.map((l) => listItem(l.replace(BULLET, '').trim())),
        })
      } else {
        out.push({
          kind: 'list',
          ordered: true,
          // * нумерацію веде список, а не модель: «1. 1. 1.» чи пропущений
          // * номер не мають ламати порядок. Від моделі — лише старт
          start: Number(ORDERED.exec(group[0])?.[1] ?? 1),
          items: group.map((l) => listItem(l.replace(ORDERED, '').trim())),
        })
      }
      group = []
    }

    for (const line of lines) {
      const next = kindOf(line)
      if (kind !== null && next !== kind) flush()
      kind = next
      group.push(line)
    }
    flush()
  }

  return out
}

/** Текст для буфера обміну: службові зірочки людині в месенджері ні до чого. */
export function plainText(text: string): string {
  return text.replaceAll('**', '')
}
