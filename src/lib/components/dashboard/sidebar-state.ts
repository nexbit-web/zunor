// Стан сайдбара живе в cookie, а не в localStorage.
//
// Причина: localStorage недоступний на сервері, тому SSR намалював би
// сайдбар у дефолтному стані, а після гідратації він стрибнув би
// у збережений — помітний ривок на кожному завантаженні.
// Cookie сервер читає до рендеру, тож розмітка одразу правильна.

export const SIDEBAR_COOKIE = 'sidebar_collapsed'

/** Рік: це UI-налаштування, воно має переживати сесію. */
const MAX_AGE = 60 * 60 * 24 * 365

/**
 * Записує стан у cookie з клієнта.
 *
 * httpOnly свідомо НЕ ставимо: cookie пише сам клієнт при кліку,
 * сервер її лише читає. Персональних даних тут немає — булеве значення
 * про ширину панелі, тож ризику витоку нуль.
 * SameSite=Lax не дає надсилати її при крос-сайтових запитах.
 */
export function persistCollapsed(collapsed: boolean): void {
  if (typeof document === 'undefined') return
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed}; path=/; max-age=${MAX_AGE}; samesite=lax`
}
