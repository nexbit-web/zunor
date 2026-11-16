// * перемикання теми колом із точки перемикача (View Transitions API): браузер
// * анімує лише маску над двома кадрами. Без підтримки API, зі «зменшити рух»
// * чи без видимої зміни кольору тема перемикається миттєво

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

  // * центр кнопки і радіус до найдальшого кута вікна — коло рівно
  // * накриває екран, без зайвого «доїзду» за його межами
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
  // * напрям: у темну коло розходиться (анімується НОВИЙ кадр), у світлу —
  // * темний СТАРИЙ кадр стягується назад у кнопку
  root.dataset.themeSwitch = toDark ? 'to-dark' : 'to-light'

  const transition = document.startViewTransition(() => {
    // * клас і color-scheme ставимо самі, синхронно: mode-watcher робить це лише
    // * в наступному кадрі. theme-switching гасить CSS-переходи всередині кола
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
