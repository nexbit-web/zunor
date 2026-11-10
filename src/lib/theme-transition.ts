// Перемикання теми колом із точки перемикача, як у Telegram: темна тема
// розходиться колом від кнопки на весь екран, а назад — стягується в неї.
//
// View Transitions API: браузер знімає два кадри (до й після) і анімує
// лише маску clip-path над ними, на відеокарті. Сторінка під час анімації
// не перемальовується кадр за кадром, тож це дешево навіть на слабкому
// телефоні. Самі кола — у layout.css (::view-transition-*).
//
// Без підтримки API (старіший Firefox), зі «зменшити рух» у системі чи
// коли видимий колір не змінюється (темна → системна, що й так темна) —
// тема перемикається миттєво, як раніше.

import { setMode } from 'mode-watcher'

export type ThemeMode = 'light' | 'dark' | 'system'

function resolvesToDark(mode: ThemeMode): boolean {
  if (mode === 'system') {
    return matchMedia('(prefers-color-scheme: dark)').matches
  }
  return mode === 'dark'
}

/**
 * Перемкнути тему. `from` — елемент, з центру якого росте (чи в який
 * стягується) коло: зазвичай натиснута кнопка.
 */
export function switchTheme(next: ThemeMode, from?: Element | null): void {
  const root = document.documentElement
  const wasDark = root.classList.contains('dark')
  const toDark = resolvesToDark(next)

  if (
    wasDark === toDark ||
    !from ||
    typeof document.startViewTransition !== 'function' ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    setMode(next)
    return
  }

  // Центр кнопки і радіус до найдальшого кута вікна — коло рівно
  // накриває екран, без зайвого «доїзду» за його межами.
  const rect = from.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  const radius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y),
  )

  root.style.setProperty('--theme-x', `${x}px`)
  root.style.setProperty('--theme-y', `${y}px`)
  root.style.setProperty('--theme-r', `${radius}px`)
  // Напрям: у темну коло розходиться (анімується НОВИЙ кадр), у світлу —
  // темний СТАРИЙ кадр стягується назад у кнопку.
  root.dataset.themeSwitch = toDark ? 'to-dark' : 'to-light'

  const transition = document.startViewTransition(() => {
    // mode-watcher ставить клас лише в наступному кадрі анімації, а кадр
    // «після» браузер знімає одразу по виходу з цього колбека. Тому клас
    // і color-scheme ставимо самі, синхронно; setMode — щоб вибір
    // зберігся й підхопився рештою застосунку (він поставить те саме).
    // theme-switching гасить CSS-переходи: інакше кольори, що мають
    // transition, ще й повільно перетікали б усередині кола.
    root.classList.add('theme-switching')
    root.classList.toggle('dark', toDark)
    root.style.colorScheme = toDark ? 'dark' : 'light'
    setMode(next)
  })

  transition.finished.finally(() => {
    delete root.dataset.themeSwitch
    root.classList.remove('theme-switching')
  })
}
