import { getContext, setContext } from 'svelte'

// Три подачі тих самих чотирьох компонентів:
//
//   card    — картка на приглушеному фоні, рядки «підпис ліворуч,
//             контрол праворуч»;
//   split   — підпис над полем без картки, розділ на дві колонки, як у
//             ClickUp: назва й пояснення ліворуч, поля праворуч (кроки
//             майстра онбордингу);
//   stacked — одна колонка, як налаштування GitHub: заголовок розділу з
//             лінією під ним, поля одне під одним — жирний підпис,
//             поле не ширше 440px, підказка текстом під ним (сторінка
//             налаштувань).
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
