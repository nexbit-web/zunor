<script lang="ts">
  // Іконка «Повідомлення». Сітка lucide 24×24, stroke 2, round caps.
  //
  // Бульбашка діалогу з трьома крапками. Анімуються крапки — по черзі,
  // як індикатор набору тексту: сенс прямий, у чаті хтось пише.
  //
  // Крапки намальовані як шляхи нульової довжини з round cap —
  // так вони підхоплюють stroke-width і масштабуються разом з іконкою,
  // на відміну від <circle> з фіксованим r.

  interface Props {
    size?: number
    strokeWidth?: number
    class?: string
    /** Зовнішнє керування. Без пропа іконка реагує на власний hover. */
    animate?: boolean
  }

  let {
    size = 17,
    strokeWidth = 2,
    class: className = '',
    animate,
  }: Props = $props()

  const controlled = $derived(animate !== undefined)
</script>

<span
  class="messages-icon {className}"
  class:is-animating={controlled && animate}
  class:is-hoverable={!controlled}
>
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- Бульбашка з хвостиком унизу ліворуч -->
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />

    <!-- Крапки: спалахують по черзі -->
    <path class="dot" d="M8 12h.01" />
    <path class="dot dot-2" d="M12 12h.01" />
    <path class="dot dot-3" d="M16 12h.01" />
  </svg>
</span>

<style>
  .messages-icon {
    display: inline-flex;
  }

  /* display:block прибирає «щілину» під базовою лінією inline-елемента,
     через яку іконка здається зміщеною в flex-контейнері. */
  .messages-icon :global(svg) {
    display: block;
  }

  .dot {
    transform-origin: center;
  }

  /* Крапка підстрибує й трохи більшає — так каскад читається як набір
     тексту, а не як просте блимання. */
  @keyframes pulse-dot {
    0%,
    100% {
      transform: translateY(0) scale(1);
      opacity: 0.55;
    }
    40% {
      transform: translateY(-1.5px) scale(1.15);
      opacity: 1;
    }
  }

  .is-hoverable:hover .dot,
  .is-animating .dot {
    animation: pulse-dot 600ms ease-in-out;
  }

  /* Затримки дають хвилю зліва направо.
     both — щоб до старту крапка лишалась у вихідному стані. */
  .is-hoverable:hover .dot-2,
  .is-animating .dot-2 {
    animation-delay: 120ms;
    animation-fill-mode: both;
  }

  .is-hoverable:hover .dot-3,
  .is-animating .dot-3 {
    animation-delay: 240ms;
    animation-fill-mode: both;
  }

  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none !important;
    }
  }
</style>
