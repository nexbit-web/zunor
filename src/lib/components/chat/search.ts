// Пошук у чаті: що знаходиться і який шматок тексту показати в списку.
// Розмітку малює шапка чату — тут лише дані, щоб їх можна було перевірити
// тестом без DOM.

import type { ChatMessage } from './types'

/** Скільки знайденого показуємо списком — далі людина уточнює запит. */
export const SEARCH_LIMIT = 100

export interface SearchSnippet {
  /** Текст до збігу (з «…», якщо обрізаний спереду). */
  before: string
  match: string
  after: string
}

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

/**
 * Повідомлення, що містять запит, — від найновішого, як у Telegram.
 * Видалене не знаходиться: «видалено» має означати «немає».
 */
export function searchMessages(
  messages: ChatMessage[],
  query: string,
): ChatMessage[] {
  const q = normalizeQuery(query)
  if (!q) return []
  const found: ChatMessage[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.deletedAt || !m.text) continue
    if (!m.text.toLowerCase().includes(q)) continue
    found.push(m)
    if (found.length === SEARCH_LIMIT) break
  }
  return found
}

const LEAD = 24
const TAIL = 90

/**
 * Рядок для списку: збіг видно навіть у довгому повідомленні — текст до
 * нього обрізаємо спереду, після — ззаду. Переноси рядків стають
 * пробілами: у списку один рядок на повідомлення.
 */
export function searchSnippet(text: string, query: string): SearchSnippet {
  const flat = text.replace(/\s+/g, ' ').trim()
  const q = normalizeQuery(query)
  const at = q ? flat.toLowerCase().indexOf(q) : -1
  if (at === -1) return { before: '', match: '', after: flat.slice(0, TAIL) }

  const from = Math.max(0, at - LEAD)
  const end = at + q.length
  return {
    before: (from > 0 ? '…' : '') + flat.slice(from, at),
    match: flat.slice(at, end),
    after: flat.slice(end, end + TAIL),
  }
}
