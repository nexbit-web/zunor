<!-- src/lib/components/breathing-logo.svelte -->
<!--
  Лого з ефектом «дихання» у primary-кольорі — індикатор завантаження.
  Пульсує масштаб + прозорість. Колір через currentColor, тож лого
  успадковує будь-який text-color контейнера (тут — var(--primary)).
  Анімація вимикається для prefers-reduced-motion.
-->
<script lang="ts">
  import Logo from '$lib/components/header/logo.svelte'

  interface Props {
    /** Розмір у px. За замовчуванням 44. */
    size?: number
    /** Підпис під лого (напр. «Завантаження…»). */
    label?: string
  }

  let { size = 44, label }: Props = $props()
</script>

<div class="breathing" role="status" aria-live="polite">
  <span class="glyph" style="width: {size}px; height: {size}px;">
    <Logo />
  </span>
  {#if label}
    <span class="label">{label}</span>
  {:else}
    <span class="sr-only">Завантаження</span>
  {/if}
</div>

<style>
  .breathing {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    /* Лого фарбується в primary через currentColor всередині SVG. */
    color: var(--primary);
  }

  .glyph {
    display: block;
    animation: breathe 1.6s ease-in-out infinite;
  }

  .glyph :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }

  .label {
    font-size: 0.8125rem;
    color: var(--muted-foreground);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  @keyframes breathe {
    0%,
    100% {
      transform: scale(0.92);
      opacity: 0.55;
    }
    50% {
      transform: scale(1.04);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .glyph {
      animation: none;
      opacity: 0.9;
    }
  }
</style>
