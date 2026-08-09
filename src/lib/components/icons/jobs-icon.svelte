<script lang="ts">
  // Іконка «Заявки». Намальована під сітку lucide 24×24, stroke 2,
  // round caps — щоб не вибивалась із рештою іконок у сайдбарі.
  //
  // Композиція: передня картка + друга, що визирає ззаду («кілька заявок»).
  // Анімуються лише рядки тексту — по черзі, ніби заявка заповнюється.
  //
  // pathLength="1" нормалізує довжину контуру до одиниці, тому
  // stroke-dasharray однаковий для обох рядків, попри різну довжину.

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
  class="jobs-icon {className}"
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
    <!-- Задня картка: визирає з-за передньої вгорі праворуч -->
    <path d="M8 8V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />

    <!-- Передня картка -->
    <rect x="3" y="8" width="14" height="13" rx="2" />

    <!-- Рядки тексту — саме вони промальовуються -->
    <path class="line" pathLength="1" d="M7 13h6" />
    <path class="line line-2" pathLength="1" d="M7 17h4" />
  </svg>
</span>

<style>
  .jobs-icon {
    display: inline-flex;
  }

  /* display:block прибирає «щілину» під базовою лінією inline-елемента,
     через яку іконка здається зміщеною в flex-контейнері. */
  .jobs-icon :global(svg) {
    display: block;
  }

  .line {
    stroke-dasharray: 1;
    stroke-dashoffset: 0;
  }

  @keyframes draw-line {
    from {
      stroke-dashoffset: 1;
      opacity: 0;
    }
    to {
      stroke-dashoffset: 0;
      opacity: 1;
    }
  }

  .is-hoverable:hover .line,
  .is-animating .line {
    animation: draw-line 400ms ease-out;
  }

  /* Другий рядок із затримкою — читається як послідовне заповнення.
     both, щоб під час затримки лінія була прихована, а не блимала. */
  .is-hoverable:hover .line-2,
  .is-animating .line-2 {
    animation-delay: 150ms;
    animation-fill-mode: both;
  }

  @media (prefers-reduced-motion: reduce) {
    .line {
      animation: none !important;
    }
  }
</style>
