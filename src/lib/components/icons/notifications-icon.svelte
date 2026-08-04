<script lang="ts">
  // Іконка «Сповіщення». Сітка lucide 24×24, stroke 2, round caps.
  //
  // Гойдається весь дзвіночок, окрім язичка — три згасаючі коливання.
  // transform-origin у точці кріплення вгорі: якщо крутити від центру,
  // рух читається як поворот, а не як дзвін.

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
  class="notifications-icon {className}"
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
    <!-- Купол дзвоника -->
    <g class="bell">
      <path
        d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"
      />
    </g>

    <!-- Язичок: гойдається окремо й сильніше за купол -->
    <path class="clapper" d="M10.268 21a2 2 0 0 0 3.464 0" />
  </svg>
</span>

<style>
  .notifications-icon {
    display: inline-flex;
  }

  /* display:block прибирає «щілину» під базовою лінією inline-елемента,
     через яку іконка здається зміщеною в flex-контейнері. */
  .notifications-icon :global(svg) {
    display: block;
  }

  /* Точка кріплення вгорі — звідти дзвіночок і гойдається. */
  .bell,
  .clapper {
    transform-origin: 12px 4px;
  }

  /* Три згасаючі коливання: амплітуда падає, як у справжнього дзвона. */
  @keyframes swing-bell {
    0%,
    100% {
      transform: rotate(0deg);
    }
    15% {
      transform: rotate(10deg);
    }
    35% {
      transform: rotate(-8deg);
    }
    55% {
      transform: rotate(5deg);
    }
    75% {
      transform: rotate(-2deg);
    }
  }

  /* Язичок відстає й хитається сильніше — саме це дає відчуття дзвону,
     а не просто повороту всієї фігури. */
  @keyframes swing-clapper {
    0%,
    100% {
      transform: rotate(0deg);
    }
    20% {
      transform: rotate(14deg);
    }
    42% {
      transform: rotate(-11deg);
    }
    62% {
      transform: rotate(7deg);
    }
    80% {
      transform: rotate(-3deg);
    }
  }

  .is-hoverable:hover .bell,
  .is-animating .bell {
    animation: swing-bell 700ms ease-in-out;
  }

  .is-hoverable:hover .clapper,
  .is-animating .clapper {
    animation: swing-clapper 700ms ease-in-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .bell,
    .clapper {
      animation: none !important;
    }
  }
</style>
