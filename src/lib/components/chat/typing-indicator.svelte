<!-- src/lib/components/chat/typing-indicator.svelte -->
<script lang="ts">
  interface Props {
    name?: string
  }
  let { name }: Props = $props()
</script>

<div class="flex items-center gap-2 px-3 py-2">
  <div
    class="flex items-center gap-1 px-3 py-2.5 rounded-2xl rounded-bl-md"
    style="background-color: color-mix(in oklch, var(--foreground) 5%, transparent)"
  >
    <span class="dot" style="--delay: 0s"></span>
    <span class="dot" style="--delay: 0.16s"></span>
    <span class="dot" style="--delay: 0.32s"></span>
  </div>
  {#if name}
    <span class="text-xs" style="color: var(--muted-foreground)">
      {name} друкує...
    </span>
  {/if}
</div>

<style>
  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 9999px;
    background-color: color-mix(in oklch, var(--foreground) 50%, transparent);
    animation: bounce 1.2s infinite ease-in-out;
    animation-delay: var(--delay);
  }
  @keyframes bounce {
    0%,
    60%,
    100% {
      transform: translateY(0);
      opacity: 0.5;
    }
    30% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
    }
  }
</style>
