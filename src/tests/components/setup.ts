// Загальна підготовка jsdom для компонентних тестів.
//
// jsdom — не браузер: у нього немає верстки, анімацій і половини API, які
// сучасний компонент вважає даністю. Кожен полифіл нижче доданий не «про
// запас», а тому що без нього конкретний компонент падає ще на монтуванні —
// і тест повідомляв би про поламаний jsdom, а не про поламаний компонент.

import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/svelte'

// matchMedia — mode-watcher питає системну тему одразу при імпорті.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }),
})

// Спостерігачі: використовує стрічка заявок (довантаження) і автовисота
// поля вводу в чаті.
class NoopObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  takeRecords = vi.fn(() => [])
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: NoopObserver,
})
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: NoopObserver,
})

// jsdom не рахує розкладку, тож скрол-методів у нього немає зовсім.
Element.prototype.scrollIntoView = vi.fn()
Element.prototype.scrollTo = vi.fn()
Element.prototype.hasPointerCapture = vi.fn(() => false)
Element.prototype.setPointerCapture = vi.fn()
Element.prototype.releasePointerCapture = vi.fn()

// Анімації: bits-ui чекає на завершення transition через Web Animations API.
if (!Element.prototype.animate) {
  Element.prototype.animate = vi.fn(
    () =>
      ({
        finished: Promise.resolve(),
        cancel: vi.fn(),
        finish: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as Animation,
  )
}

// Звук сповіщень. Без заглушки jsdom кидає «Not implemented».
window.HTMLMediaElement.prototype.play = vi.fn(async () => {})
window.HTMLMediaElement.prototype.pause = vi.fn()

// jsdom не вміє переходити за посиланням і пише «Not implemented: navigation»
// на кожен клік по рядку списку. Обробники компонента вже відпрацювали
// (подія дійшла сюди спливанням), тож гасимо саме перехід — інакше прогін
// тоне в чужих попередженнях.
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement | null
  if (target?.closest?.('a')) e.preventDefault()
})

// Кожен тест монтує компонент у document.body — без прибирання наступний
// знайшов би там і свій елемент, і чужий.
afterEach(() => {
  cleanup()
})
