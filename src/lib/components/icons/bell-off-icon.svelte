<script lang="ts">
  // Перекреслений дзвіночок для тоста «звук вимкнено».
  // Дзвіночок завмирає, а риска прокреслюється — рух іде в один бік,
  // на відміну від коливань «увімкнено». Різницю видно навіть боковим зором.
  interface Props {
    size?: number
  }

  let { size = 18 }: Props = $props()
</script>

<svg
  class="text-red-500 dark:text-red-400"
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
    <path d="M10.268 21a2 2 0 0 0 3.464 0" />
  </g>

  <!-- Риска. pathLength="1" нормалізує довжину контуру, тому
       stroke-dasharray однаковий незалежно від координат. -->
  <path class="slash" pathLength="1" d="M3 3l18 18" />
</svg>

<style>
  svg {
    display: block;
  }

  /* Дзвіночок в'яне: коротке стискання, поки риска його перекреслює. */
  .bell {
    transform-origin: 12px 12px;
    animation: mute-bell 420ms cubic-bezier(0.32, 0.72, 0, 1);
  }

  .slash {
    stroke-dasharray: 1;
    stroke-dashoffset: 0;
    animation: draw-slash 380ms ease-out 120ms both;
  }

  @keyframes mute-bell {
    0% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(0.9);
      opacity: 0.6;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  @keyframes draw-slash {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bell,
    .slash {
      animation: none;
    }
  }
</style>
