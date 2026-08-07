/**
 * Валідація redirectTo проти open-redirect.
 * Приймаємо лише внутрішні шляхи: починається з "/", але не "//" і не "/\"
 * (обидва браузер трактує як protocol-relative URL на чужий домен).
 * Auth-сторінки (/user/*) відкидаємо — інакше redirect-петля login → login.
 */

/** Найбільший код символу, який браузер викидає з URL мовчки. */
const LAST_CONTROL = 0x20
const DEL = 0x7f

/**
 * Прибирає керуючі символи так само, як це зробить браузер.
 *
 * Керуючі символи (табуляція, \n, \r) з URL саме ВИКИДАЮТЬСЯ, а не
 * екрануються — так робить і WHATWG URL, за яким працюють goto() та
 * callbackURL у better-auth. Тому "/<TAB>/evil.com" перетворюється на
 * "//evil.com", тобто protocol-relative посилання на чужий домен, і жертва
 * потрапляє туди вже з ЖИВОЮ сесією.
 *
 * Фільтр мусить дивитись на те, що ПОБАЧИТЬ браузер, а не на сирий рядок:
 * інакше перевіряємо одне, а відкривається інше. Робоче посилання було
 * /user/login?redirectTo=/%09/evil.com — searchParams.get() декодує %09 у
 * табуляцію ще до виклику сюди.
 *
 * Через коди символів, а не регексом: керуючі символи в регексі довелося б
 * писати escape-послідовностями, і одна зіпсована втеча зробила б перевірку
 * знову косметичною — мовчки.
 */
function stripControlChars(raw: string): string {
  let out = ''
  for (const ch of raw) {
    const code = ch.charCodeAt(0)
    if (code > LAST_CONTROL && code !== DEL) out += ch
  }
  return out
}

export function safeRedirectTarget(raw: string | null): string {
  const fallback = '/dashboard'
  if (!raw) return fallback

  const path = stripControlChars(raw)

  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.startsWith('/\\')
  ) {
    return fallback
  }
  if (path.startsWith('/user/')) return fallback

  // Повертаємо ВИЧИЩЕНИЙ шлях, а не raw: інакше браузер отримав би той
  // самий сирий рядок і перевірка нічого не значила б.
  return path
}
