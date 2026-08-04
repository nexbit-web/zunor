<script lang="ts">
  // Рука, що вітається — для тоста при вході.
  // Пара до WaveIcon (вихід): та сама кисть, але рух дзеркальний
  // і швидший. Прощання затухає, привітання набирає.

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
  <g class="hand">
    <!-- Чотири пальці -->
    <path d="M7 11V6a1.5 1.5 0 0 1 3 0v4" />
    <path d="M10 10V4.5a1.5 1.5 0 0 1 3 0V10" />
    <path d="M13 10V5.5a1.5 1.5 0 0 1 3 0V11" />
    <!-- Долоня з великим пальцем -->
    <path
      d="M16 11V8.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7v-1.5a1.5 1.5 0 0 1 3 0V14"
    />
  </g>
</svg>

<style>
  svg {
    display: block;
  }

  /* Обертання від зап'ястя, як і в іконці прощання. */
  .hand {
    transform-origin: 12px 21px;
    animation: wave-hello 800ms cubic-bezier(0.32, 0.72, 0, 1);
  }

  /* Дзеркально до прощання: починає з іншого боку, амплітуда
     не затухає, а тримається — привітання бадьоріше за прощання. */
  @keyframes wave-hello {
    0% {
      transform: rotate(0deg) scale(0.85);
    }
    20% {
      transform: rotate(-13deg) scale(1);
    }
    40% {
      transform: rotate(12deg) scale(1);
    }
    60% {
      transform: rotate(-10deg) scale(1);
    }
    80% {
      transform: rotate(9deg) scale(1);
    }
    100% {
      transform: rotate(0deg) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hand {
      animation: none;
    }
  }
</style>
