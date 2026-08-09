// Санітизація «копірайту» заявки (title/description) з недовірених джерел:
// вивід LLM або клієнтський POST. Svelte екранує рядки при рендері, тож
// задача тут не анти-XSS, а гігієна: без керуючих символів, однорядкова
// назва, ліміти довжини. Не пройшло — null, викликаючий код підставляє
// шаблонний фолбек (generateTitle).

const TITLE_MIN = 8
const TITLE_MAX = 80
const DESC_MIN = 10
const DESC_MAX = 2000

/** Прибирає керуючі символи (опційно лишаючи \n), схлопує повтори пробілів. */
function stripControl(s: string, keepNewlines: boolean): string {
  const re = keepNewlines
    ? /[\u0000-\u0009\u000B-\u001F\u007F]/g
    : /[\u0000-\u001F\u007F]/g
  return s
    .replace(re, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function sanitizeJobTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const oneLine = stripControl(raw.replace(/\s+/g, ' '), false)
  if (oneLine.length < TITLE_MIN) return null
  if (oneLine.length <= TITLE_MAX) return oneLine
  // Обрізаємо по межі слова, щоб не лишати «Генеральне прибир»
  const cut = oneLine.slice(0, TITLE_MAX)
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace > TITLE_MIN ? cut.slice(0, lastSpace) : cut
}

export function sanitizeJobDescription(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = stripControl(raw, true).replace(/\n{3,}/g, '\n\n')
  if (text.length < DESC_MIN) return null
  return text.slice(0, DESC_MAX)
}
