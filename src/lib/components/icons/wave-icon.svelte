<script lang="ts">
  // Рука, що махає — для тоста при виході з акаунта.
  // Сітка lucide 24×24, stroke 2, round caps.
  //
  // Анімується вся кисть: три помахи із затуханням, як справжній жест.
  // transform-origin унизу — рука хитається від зап'ястя, а не від центру.

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
    <!-- Долоня з великим пальцем: контур кисті -->
    <path
      d="M16 11V8.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7v-1.5a1.5 1.5 0 0 1 3 0V14"
    />
  </g>
</svg>

<style>
  svg {
    display: block;
  }

  /* Точка обертання внизу — зап'ястя. Від центру рух читався б
     як обертання предмета, а не як жест. */
  .hand {
    transform-origin: 12px 21px;
    animation: wave 900ms ease-in-out;
  }

  /* Три помахи із затуханням амплітуди: 14° → 11° → 6°.
     Рівні коливання виглядають механічно. */
  @keyframes wave {
    0%,
    100% {
      transform: rotate(0deg);
    }
    15% {
      transform: rotate(14deg);
    }
    30% {
      transform: rotate(-11deg);
    }
    45% {
      transform: rotate(11deg);
    }
    60% {
      transform: rotate(-6deg);
    }
    75% {
      transform: rotate(6deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hand {
      animation: none;
    }
  }
</style>
