// src/lib/utils/json-ld.ts
//
// Серіалізація JSON-LD для вставки в <script type="application/ld+json">.
//
// Голий JSON.stringify для цього НЕ годиться: він не екранує `<`, тож
// значення `</script><script>…` розриває тег і виконується як код сторінки.
// А значення туди приходять від користувачів — ім'я та опис у профілі
// майстра. Це класичний stored XSS, який виконався б у кожного, хто
// відкрив чужу публічну сторінку.
//
// U+2028/U+2029 екрануються з іншої причини: у JSON вони валідні, а в
// JavaScript до ES2019 були розривами рядка й ламали парсинг.
//
// Самі символи будуються через fromCharCode навмисно: вони невидимі в
// редакторі, і вставлені «як є» перетворюють цей файл на пастку для
// наступного, хто його редагуватиме.

const LINE_SEP = String.fromCharCode(0x2028)
const PARA_SEP = String.fromCharCode(0x2029)

const ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  [LINE_SEP]: '\\u2028',
  [PARA_SEP]: '\\u2029',
}

const UNSAFE_RE = new RegExp(`[<>&${LINE_SEP}${PARA_SEP}]`, 'g')

/** JSON.stringify, безпечний для вставки всередину <script>. */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(UNSAFE_RE, (c) => ESCAPES[c] ?? c)
}
