<script lang="ts">
  // Іконка «Аналітика». Сітка lucide 24×24, stroke 2, round caps.
  //
  // Стовпчики виростають знизу вгору по черзі. transform-origin
  // у нижній точці кожного стовпчика — інакше вони росли б від центру
  // в обидва боки, і це читалося б як масштабування, а не як графік.

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
  class="analytics-icon {className}"
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
    <!-- Осі — статичні -->
    <path d="M3 3v16a2 2 0 0 0 2 2h16" />

    <!-- Стовпчики: зростають по черзі зліва направо -->
    <path class="bar bar-1" d="M8 17v-4" />
    <path class="bar bar-2" d="M13 17v-7" />
    <path class="bar bar-3" d="M18 17v-10" />
  </svg>
</span>

<style>
  .analytics-icon {
    display: inline-flex;
  }

  /* display:block прибирає «щілину» під базовою лінією inline-елемента,
     через яку іконка здається зміщеною в flex-контейнері. */
  .analytics-icon :global(svg) {
    display: block;
  }

  /* Кожен стовпчик росте від власної основи на y=17. */
  .bar {
    transform-origin: center 17px;
  }

  @keyframes grow-bar {
    from {
      transform: scaleY(0);
      opacity: 0;
    }
    to {
      transform: scaleY(1);
      opacity: 1;
    }
  }

  .is-hoverable:hover .bar,
  .is-animating .bar {
    animation: grow-bar 380ms cubic-bezier(0.32, 0.72, 0, 1);
  }

  /* Затримки дають хвилю зліва направо.
     both — щоб до старту стовпчик лишався прихованим, а не блимав. */
  .is-hoverable:hover .bar-2,
  .is-animating .bar-2 {
    animation-delay: 90ms;
    animation-fill-mode: both;
  }

  .is-hoverable:hover .bar-3,
  .is-animating .bar-3 {
    animation-delay: 180ms;
    animation-fill-mode: both;
  }

  @media (prefers-reduced-motion: reduce) {
    .bar {
      animation: none !important;
    }
  }
</style>
