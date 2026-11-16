import { getContext, setContext } from 'svelte'

// * три подачі тих самих компонентів:
// *   card    — картка, рядки «підпис ліворуч, контрол праворуч»
// *   split   — підпис над полем, розділ на дві колонки (онбординг майстра)
// *   stacked — назва розділу над карткою з рядками (сторінка налаштувань)
// * Подачу задає контейнер, а не сторінка

export type SettingsLayout = 'card' | 'split' | 'stacked'

// * експортований лише заради тестів: так вони задають подачу через
// * `render(..., { context })`, без окремого компонента-обгортки
export const SETTINGS_LAYOUT_KEY = Symbol('settings-layout')

export function setSettingsLayout(layout: SettingsLayout): void {
  setContext(SETTINGS_LAYOUT_KEY, layout)
}

export function getSettingsLayout(): SettingsLayout {
  return getContext<SettingsLayout | undefined>(SETTINGS_LAYOUT_KEY) ?? 'card'
}
