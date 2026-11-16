import type { Action } from 'svelte/action'

/**
 * Поява елемента при скролі, один раз: `<div use:reveal>` або
 * `use:reveal={90}` із затримкою в мс.
 *
 * Прихований стан ставить ця функція, а не CSS: без JS сторінка лишається
 * видимою. Те, що вже на екрані в момент монтування, не чіпаємо — інакше
 * перший екран миготів би.
 */

const DURATION_MS = 700
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
const OFFSET = '28px'

/** Частка висоти вікна, нижче якої елемент вважається «ще не баченим». */
const BELOW_FOLD = 0.9

export const reveal: Action<HTMLElement, number | undefined> = (
  node,
  delay = 0,
) => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (node.getBoundingClientRect().top < window.innerHeight * BELOW_FOLD) return

  const { style } = node
  style.transition = `opacity ${DURATION_MS}ms ${EASING}, transform ${DURATION_MS}ms ${EASING}`
  style.transitionDelay = `${delay}ms`
  style.opacity = '0'
  style.transform = `translateY(${OFFSET})`

  const io = new IntersectionObserver(
    (entries) => {
      if (!entries[0].isIntersecting) return
      // * порожній рядок, а не конкретне значення: властивість
      // * прибирається з inline-стилю, і елемент повертається до того,
      // * що йому призначили класи
      style.opacity = ''
      style.transform = ''
      io.disconnect()
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
  )

  io.observe(node)

  return {
    destroy: () => io.disconnect(),
  }
}
