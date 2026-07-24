// src/lib/server/zunor/detect-service.ts
//
// Детект активної послуги (Intent Detection). Скан історії з КІНЦЯ,
// тільки user-повідомлення. Це UX-оптимізація промпту, НЕ рівень безпеки:
// авторитетне поле service все одно валідує validateCleaningMetadata.
import { SERVICES } from '$lib/categories/cleaning/presets'
import type { ZunorClientMessage } from '$lib/types/zunor'
import { SERVICE_SYNONYMS, type ServiceKey } from './service-rules'

// Нормалізація: нижній регістр + усі види апострофів → прямий,
// щоб 'вікна' ловилось незалежно від ʼ/'/`.
function norm(s: string): string {
  return s.toLowerCase().replace(/[’'`ʼ]/g, "'")
}

// Збіг лише на ПОЧАТКУ слова: needle не може стояти всередині іншого
// слова ('вітрин' не спрацює у вигаданому '...повітрин...').
// Випадок, коли needle — початок ДОВШОГО слова ('стіл' у 'стільки'),
// цим не ловиться — такі синоніми прибрані з SERVICE_SYNONYMS.
function findNeedle(text: string, needle: string): number {
  let from = 0
  while (from <= text.length - needle.length) {
    const at = text.indexOf(needle, from)
    if (at === -1) return -1
    const prev = at === 0 ? '' : text[at - 1]!
    if (at === 0 || !/[a-zа-яіїєґ']/.test(prev)) return at
    from = at + 1
  }
  return -1
}

const TRIGGERS: ReadonlyArray<{ key: ServiceKey; needles: readonly string[] }> =
  SERVICES.map((s) => ({
    key: s.key,
    needles: [norm(s.label), ...(SERVICE_SYNONYMS[s.key] ?? []).map(norm)],
  }))

export function detectActiveService(
  history: ReadonlyArray<ZunorClientMessage>,
): ServiceKey | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]
    if (!msg || msg.role !== 'user') continue

    const text = norm(msg.content)
    // У межах одного повідомлення виграє послуга з найранішим збігом
    // (натиск кнопки → весь текст = label → збіг на 0 → виграє).
    let best: { key: ServiceKey; at: number } | null = null
    for (const t of TRIGGERS) {
      for (const needle of t.needles) {
        if (!needle) continue
        const at = findNeedle(text, needle)
        if (at !== -1 && (best === null || at < best.at)) {
          best = { key: t.key, at }
        }
      }
    }
    if (best) return best.key
  }
  return null
}
