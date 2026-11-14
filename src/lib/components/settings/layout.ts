import { getContext, setContext } from 'svelte'

// Три подачі тих самих чотирьох компонентів:
//
//   card    — картка на приглушеному фоні, рядки «підпис ліворуч,
//             контрол праворуч»;
//   split   — підпис над полем без картки, розділ на дві колонки, як у
//             ClickUp: назва й пояснення ліворуч, поля праворуч (кроки
//             майстра онбордингу);
//   stacked — як налаштування ClickUp (сторінка налаштувань): назва
//             розділу й пояснення над карткою з тонкою рамкою, у картці
//             рядки «назва й сірий опис ліворуч, контрол праворуч»,
//             розділені лініями на всю ширину.
//
// Подачу задає контейнер, а не кожна сторінка: розділ налаштувань і
// форма онбордингу — той самий компонент, і він не мусить знати, де
// його показують.

export type SettingsLayout = 'card' | 'split' | 'stacked'

// Експортований лише заради тестів: так вони задають подачу через
// `render(..., { context })`, без окремого компонента-обгортки.
export const SETTINGS_LAYOUT_KEY = Symbol('settings-layout')

export function setSettingsLayout(layout: SettingsLayout): void {
  setContext(SETTINGS_LAYOUT_KEY, layout)
}

export function getSettingsLayout(): SettingsLayout {
  return getContext<SettingsLayout | undefined>(SETTINGS_LAYOUT_KEY) ?? 'card'
}
