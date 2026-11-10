// Посилання в тексті повідомлення — клікабельні, як у будь-якому
// месенджері: адресу, яку скинув майстер, не треба виділяти й копіювати.
//
// Розбиваємо текст на шматки, а розмітку малює компонент: {@html} у
// проєкті заборонений (AGENTS.md, «Безпека»), і так текст лишається
// текстом. Посиланням стає лише http(s) або www. — ніяких javascript: чи
// data:, навіть якщо їх написали в повідомленні.

export type TextPart =
  | { kind: 'text'; value: string }
  | { kind: 'link'; value: string; href: string }

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi

/** Розділові знаки в кінці — частина речення, а не адреси. */
const TRAILING = /[.,!?:;'")\]}»]+$/

export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0

  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0
    let raw = match[0]
    const tail = raw.match(TRAILING)?.[0] ?? ''
    // Дужку лишаємо, якщо в адресі є відкрита: …/wiki/Kyiv_(city)
    const keepParen =
      tail.startsWith(')') && raw.slice(0, -tail.length).includes('(')
    if (tail && !keepParen) raw = raw.slice(0, -tail.length)
    if (!raw) continue

    if (start > last)
      parts.push({ kind: 'text', value: text.slice(last, start) })
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    parts.push({ kind: 'link', value: raw, href })
    last = start + raw.length
  }

  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) })
  return parts
}

/**
 * Перше посилання в тексті — для нього сервер робить картку-превʼю, як
 * Telegram. Те саме правило, що й для клікабельності: превʼю не буває в
 * того, що не стало посиланням.
 */
export function firstLink(text: string): string | null {
  for (const part of linkify(text)) if (part.kind === 'link') return part.href
  return null
}
