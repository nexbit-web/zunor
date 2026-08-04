<script lang="ts">
  // Іконка «Замовлення». Сітка lucide 24×24, stroke 2, round caps —
  // щоб не вибивалась із рештою іконок у сайдбарі.
  //
  // Планшет із затискачем угорі: силует помітно відрізняється від
  // карток заявок навіть у згорнутому сайдбарі на 17px.
  //
  // Анімується галочка — малюється від короткого штриха до довгого,
  // як справжня відмітка. pathLength="1" нормалізує довжину контуру.

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
  class="orders-icon {className}"
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
    <!-- Затискач планшета -->
    <rect x="8" y="2" width="8" height="4" rx="1" />

    <!-- Корпус: обходить затискач зліва й справа -->
    <path
      d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
    />

    <!-- Галочка — саме вона промальовується -->
    <path class="check" pathLength="1" d="m9 14 2 2 4-4" />
  </svg>
</span>

<style>
  .orders-icon {
    display: inline-flex;
  }

  /* display:block прибирає «щілину» під базовою лінією inline-елемента,
     через яку іконка здається зміщеною в flex-контейнері. */
  .orders-icon :global(svg) {
    display: block;
  }

  .check {
    stroke-dasharray: 1;
    stroke-dashoffset: 0;
  }

  @keyframes draw-check {
    from {
      stroke-dashoffset: 1;
      opacity: 0;
    }
    to {
      stroke-dashoffset: 0;
      opacity: 1;
    }
  }

  /* Швидше за інші іконки: галочка коротка, повільне малювання
     виглядало б як гальмування. */
  .is-hoverable:hover .check,
  .is-animating .check {
    animation: draw-check 380ms ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .check {
      animation: none !important;
    }
  }
</style>
