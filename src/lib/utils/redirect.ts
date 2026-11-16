/**
 * redirectTo проти open-redirect: лише внутрішні шляхи — з "/", але не "//"
 * і не "/\". Сторінки /user/* відкидаємо: інакше петля login → login.
 */

/** Найбільший код символу, який браузер викидає з URL мовчки. */
const LAST_CONTROL = 0x20
const DEL = 0x7f

/**
 * Прибирає керуючі символи так, як це зробить браузер: він їх викидає, і
 * "/<TAB>/evil.com" стає "//evil.com". Перевіряти треба те, що побачить
 * браузер. Через коди символів, а не регексом — щоб перевірку не зіпсувала
 * одна escape-послідовність.
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

  // * повертаємо ВИЧИЩЕНИЙ шлях, а не raw: інакше браузер отримав би той
  // * самий сирий рядок і перевірка нічого не значила б
  return path
}
