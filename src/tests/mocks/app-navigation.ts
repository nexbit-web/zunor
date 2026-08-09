// Заглушка для $app/navigation.
//
// У тестах компонентів навігації не відбувається — але клік по кнопці
// «Скасувати» кличе goto(), і без заглушки компонент не змонтується взагалі.
// Виклики це vi.fn(), тож тест може перевірити, КУДИ повели користувача:
// саме там ловляться регресії на кшталт «клієнта кинуло на сторінку майстра».

import { vi } from 'vitest'

export const goto = vi.fn(async (_url: string | URL, _opts?: unknown) => {})
export const invalidateAll = vi.fn(async () => {})
export const invalidate = vi.fn(async () => {})
export const replaceState = vi.fn((_url: string | URL, _state: unknown) => {})
export const pushState = vi.fn((_url: string | URL, _state: unknown) => {})
export const preloadData = vi.fn(async () => ({ type: 'loaded' }) as unknown)
export const preloadCode = vi.fn(async () => {})

// Хуки навігації: компонент реєструє колбек, тест може смикнути його руками.
export const beforeNavigate = vi.fn((_fn: (nav: unknown) => void) => {})
export const afterNavigate = vi.fn((_fn: (nav: unknown) => void) => {})
export const onNavigate = vi.fn((_fn: (nav: unknown) => void) => {})

export function resetNavigation(): void {
  for (const fn of [
    goto,
    invalidateAll,
    invalidate,
    replaceState,
    pushState,
    preloadData,
    preloadCode,
    beforeNavigate,
    afterNavigate,
    onNavigate,
  ]) {
    fn.mockClear()
  }
}
