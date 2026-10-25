import { getContext, setContext } from 'svelte'

// Дві подачі тих самих чотирьох компонентів:
//
//   card  — картка на приглушеному фоні, рядки «підпис ліворуч, контрол
//           праворуч» (онбординг: вузька колонка по центру екрана);
//   split — розділ на дві колонки, як у ClickUp: назва й пояснення
//           ліворуч, поля праворуч, розділи відділені волосяною лінією
//           (сторінка налаштувань — там ширина є, і картка лише
//           додавала б зайву рамку).
//
// Подачу задає контейнер, а не кожна сторінка: розділ налаштувань і
// форма онбордингу — той самий компонент, і він не мусить знати, де
// його показують.

export type SettingsLayout = 'card' | 'split'

// Експортований лише заради тестів: так вони задають подачу через
// `render(..., { context })`, без окремого компонента-обгортки.
export const SETTINGS_LAYOUT_KEY = Symbol('settings-layout')

export function setSettingsLayout(layout: SettingsLayout): void {
  setContext(SETTINGS_LAYOUT_KEY, layout)
}

export function getSettingsLayout(): SettingsLayout {
  return getContext<SettingsLayout | undefined>(SETTINGS_LAYOUT_KEY) ?? 'card'
}
