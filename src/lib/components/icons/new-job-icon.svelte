<script lang="ts">
  // Іконка «Нове замовлення». Сітка lucide 24×24, stroke 2, round caps.
  //
  // Плюс у колі — найпряміше позначення створення. Свідомо просте:
  // силует не плутається ні з бульбашкою чату, ні з картками заявок.
  //
  // Анімація: коло провертається на чверть оберту, плюс водночас
  // трохи більшає — як кнопка додавання в мобільних застосунках.

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
  class="new-job-icon {className}"
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
    <circle class="ring" cx="12" cy="12" r="10" />
    <g class="plus">
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </g>
  </svg>
</span>

<style>
  .new-job-icon {
    display: inline-flex;
  }

  /* display:block прибирає «щілину» під базовою лінією inline-елемента,
     через яку іконка здається зміщеною в flex-контейнері. */
  .new-job-icon :global(svg) {
    display: block;
  }

  .ring,
  .plus {
    transform-origin: 12px 12px;
  }

  /* Гумовість дає крива з виходом за одиницю: елемент проскакує
     цільове значення й м'яко повертається.
     1.58 по y — виразний переліт, але ще не карикатурний. */
  .ring {
    transition: transform 620ms cubic-bezier(0.34, 1.58, 0.42, 1);
  }

  /* Плюс стартує на 60ms пізніше й пружинить сильніше — саме це
     розходження таймінгів читається як пружність, а не як
     одночасний стрибок двох фігур. */
  .plus {
    transition: transform 620ms cubic-bezier(0.34, 1.72, 0.42, 1) 60ms;
  }

  .is-hoverable:hover .ring,
  .is-animating .ring {
    transform: rotate(90deg) scale(1.06);
  }

  .is-hoverable:hover .plus,
  .is-animating .plus {
    transform: scale(1.28);
  }

  @media (prefers-reduced-motion: reduce) {
    .ring,
    .plus {
      transition: none;
      transform: none !important;
    }
  }
</style>