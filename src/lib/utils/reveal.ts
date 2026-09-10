import type { Action } from 'svelte/action'

/**
 * Поява елемента при скролі: знизу вгору, плавно, один раз.
 *
 * Використання:
 *
 * ```svelte
 * <div use:reveal>…</div>
 * <li use:reveal={90}>…</li>   <!-- із затримкою в мілісекундах -->
 * ```
 *
 * Чому не `svelte/transition`: `transition:` спрацьовує на МОНТУВАННІ,
 * тобто вся сторінка «зʼявилася» б ще до того, як людина до неї
 * доскролила. Тут потрібен саме момент перетину вьюпорта.
 *
 * Три рішення, які легко зламати, якщо переписувати:
 *
 * 1. **Прихований стан ставить ця функція, а не CSS.** Якби
 *    `opacity: 0` лежав у стилях сторінки, то без JS — і для будь-якого
 *    краулера, що не виконує скрипти, — сторінка була б порожнім
 *    полотном. Дія виконується лише в браузері, тож розмітка з сервера
 *    завжди приходить видимою.
 *
 * 2. **Те, що вже на екрані в момент монтування, не чіпаємо взагалі.**
 *    Інакше видимий блок спершу зник би, а потім проявився назад — на
 *    першому екрані це помітно як миготіння. Для нього роблять окрему
 *    анімацію на завантаженні.
 *
 * 3. **Спостереження одноразове.** Повторна анімація на кожен прохід
 *    повз блок — це вже атракціон, а не акцент.
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
      // Порожній рядок, а не конкретне значення: властивість
      // прибирається з inline-стилю, і елемент повертається до того,
      // що йому призначили класи.
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
