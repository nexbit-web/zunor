<script lang="ts">
  // Дзвіночок для тоста «звук увімкнено». Гойдається один раз —
  // рух і є підтвердженням, що перемикач спрацював.
  interface Props {
    size?: number
  }

  let { size = 18 }: Props = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <g class="bell">
    <path
      d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"
    />
  </g>
  <path class="clapper" d="M10.268 21a2 2 0 0 0 3.464 0" />
</svg>

<style>
  svg {
    display: block;
  }

  /* Точка кріплення вгорі — звідти дзвіночок і гойдається.
     Від центру рух читався б як поворот, а не як дзвін. */
  .bell,
  .clapper {
    transform-origin: 12px 4px;
  }

  .bell {
    animation: swing-bell 700ms ease-in-out;
  }
  /* Язичок відстає й хитається сильніше — саме це дає відчуття дзвону. */
  .clapper {
    animation: swing-clapper 700ms ease-in-out;
  }

  @keyframes swing-bell {
    0%,
    100% {
      transform: rotate(0deg);
    }
    15% {
      transform: rotate(11deg);
    }
    35% {
      transform: rotate(-9deg);
    }
    55% {
      transform: rotate(6deg);
    }
    75% {
      transform: rotate(-3deg);
    }
  }

  @keyframes swing-clapper {
    0%,
    100% {
      transform: rotate(0deg);
    }
    20% {
      transform: rotate(15deg);
    }
    42% {
      transform: rotate(-12deg);
    }
    62% {
      transform: rotate(8deg);
    }
    80% {
      transform: rotate(-4deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bell,
    .clapper {
      animation: none;
    }
  }
</style>
