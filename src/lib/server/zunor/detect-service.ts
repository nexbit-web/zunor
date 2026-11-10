// Детект активної послуги (Intent Detection). Скан історії від ПОЧАТКУ,
// тільки user-повідомлення: обрана послуга тримається, доки клієнт явно
// не передумає. Це UX-оптимізація промпту, НЕ рівень безпеки: авторитетне
// поле service все одно валідує validateCleaningMetadata.
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

// Межі слова — Unicode-класами: `\b` у JS не бачить кирилиці (AGENTS.md).
const word = (alternatives: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}_])(${alternatives})(?![\\p{L}\\p{N}_])`, 'iu')

/**
 * Явна зміна наміру. Голих «ні»/«нет» тут немає навмисно: це звичайна
 * відповідь («Ні, тварин немає…»), і вона перемикала б послугу.
 */
const CHANGE_OF_MIND = word(
  'хоча|хотя|краще|лучше|замість|вместо|передумав|передумала|насправді|на самом деле',
)

/** Додаток до обраного: «вікна теж», «ещё окна» — деталь, а не новий вибір. */
const ADDITION = word(
  'теж|також|ще|заодно|додатково|плюс|тоже|также|ещё|еще|дополнительно',
)

/** Натиснута кнопка чи коротка репліка-вибір: «Миття вікон», «Генеральне». */
const CHOICE_MAX_WORDS = 3

interface Mention {
  key: ServiceKey
  /** Позиція збігу в повідомленні: 0 — повідомлення починається з послуги. */
  at: number
}

/** Послуга, названа першою в межах одного повідомлення. */
function serviceIn(content: string): Mention | null {
  const text = norm(content).trimStart()
  let best: Mention | null = null
  for (const t of TRIGGERS) {
    for (const needle of t.needles) {
      if (!needle) continue
      const at = findNeedle(text, needle)
      if (at !== -1 && (best === null || at < best.at)) {
        best = { key: t.key, at }
      }
    }
  }
  return best
}

/**
 * Репліка-вибір: коротка, без цифр і ПОЧИНАЄТЬСЯ з назви послуги — так
 * виглядає натиснута кнопка. «5 вікон» чи «пʼять вікон» — це відповідь на
 * «скільки вікон?» усередині генерального, а не новий вибір.
 */
function isChoice(content: string, mention: Mention): boolean {
  const words = content.trim().split(/\s+/).length
  return mention.at === 0 && words <= CHOICE_MAX_WORDS && !/\d/.test(content)
}

/**
 * Активна послуга розмови. Обрану послугу тримаємо: згадка іншої в
 * ВІДПОВІДІ — це деталь, а не новий вибір. «Генеральне… вікна теж
 * хотілося б» перемикало фокус на «Миття вікон», і агент вимагав
 * кількість вікон як обовʼязкове поле, доки клієнт не здавався.
 *
 * Перемикаємо лише на явну зміну наміру або на коротку репліку-вибір.
 */
export function detectActiveService(
  history: ReadonlyArray<ZunorClientMessage>,
): ServiceKey | null {
  let active: ServiceKey | null = null
  for (const msg of history) {
    if (msg.role !== 'user') continue
    const found = serviceIn(msg.content)
    if (!found || found.key === active) continue

    const addition = ADDITION.test(msg.content)
    const changedMind = CHANGE_OF_MIND.test(msg.content) && !addition
    if (
      active === null ||
      changedMind ||
      (!addition && isChoice(msg.content, found))
    ) {
      active = found.key
    }
  }
  return active
}
