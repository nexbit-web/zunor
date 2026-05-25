<!-- src/lib/components/success-check.svelte -->
<!-- Анімована галочка успіху: малюється по контуру + pop із крапками -->
<script lang="ts">
  let { size = 96 }: { size?: number } = $props()
</script>

<svg
  class="success-check"
  viewBox="0 0 48 48"
  style="width: {size}px; height: {size}px"
  role="img"
  aria-label="Успіх"
>
  <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="4">
    <!-- Коло-спалах -->
    <circle class="sc__pop-end" cx="24" cy="24" r="18" opacity="0" />
    <g fill="currentColor" stroke="none">
      <circle class="sc__pop-start" cx="24" cy="24" r="20" opacity="0" />
      <!-- Крапки навколо -->
      {#each [0, 51.43, 102.86, 154.29, 205.71, 257.14, 308.57] as angle (angle)}
        <g transform="rotate({angle},24,24)">
          <g class="sc__dot-group" opacity="0">
            <circle class="sc__dot" cx="22" cy="5" r="1.5" />
          </g>
          <g class="sc__dot-group" opacity="0">
            <circle class="sc__dot" cx="26" cy="2" r="1.5" />
          </g>
        </g>
      {/each}
    </g>
    <!-- Галочка -->
    <path
      class="sc__check"
      d="M 14 25 L 21 32 L 35 16"
      stroke-dasharray="40 40"
      stroke-dashoffset="40"
    />
  </g>
</svg>

<style>
  .success-check {
    color: #22c55e;
    overflow: visible;
  }

  .sc__check {
    transform-origin: 24px 24px;
    animation: sc-check 0.9s cubic-bezier(0.65, 0, 0.35, 1) forwards;
  }
  @keyframes sc-check {
    0% {
      stroke-dashoffset: 40;
      transform: scale(1);
    }
    45% {
      stroke-dashoffset: 0;
      transform: scale(1);
    }
    60% {
      transform: scale(0.5);
    }
    78% {
      transform: scale(1.35);
    }
    100% {
      stroke-dashoffset: 0;
      transform: scale(1);
    }
  }

  .sc__pop-start {
    transform-origin: 24px 24px;
    animation: sc-pop-start 0.9s cubic-bezier(0.65, 0, 0.35, 1) forwards;
  }
  @keyframes sc-pop-start {
    0%,
    50% {
      opacity: 0;
      transform: scale(0.35);
    }
    60% {
      opacity: 1;
      transform: scale(0.35);
    }
    72% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(1);
    }
  }

  .sc__pop-end {
    animation: sc-pop-end 0.9s cubic-bezier(0.61, 1, 0.88, 1) forwards;
  }
  @keyframes sc-pop-end {
    0%,
    55% {
      opacity: 0;
      r: 18px;
      stroke-width: 4px;
    }
    65% {
      opacity: 1;
      r: 18px;
      stroke-width: 4px;
    }
    72%,
    100% {
      opacity: 0;
      r: 22px;
      stroke-width: 2px;
    }
  }

  .sc__dot {
    animation: sc-dot 0.9s cubic-bezier(0.33, 1, 0.68, 1) forwards;
  }
  @keyframes sc-dot {
    0%,
    60% {
      transform: translate(0, 6px);
    }
    100% {
      transform: translate(0, 0);
    }
  }
  .sc__dot-group {
    animation: sc-dot-group 0.9s linear forwards;
  }
  @keyframes sc-dot-group {
    0%,
    60% {
      opacity: 0;
    }
    68%,
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sc__check,
    .sc__pop-start,
    .sc__pop-end,
    .sc__dot,
    .sc__dot-group {
      animation: none;
    }
    .sc__check {
      stroke-dashoffset: 0;
    }
  }
</style>
