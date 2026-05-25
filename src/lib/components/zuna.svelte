<!-- src/lib/components/zuna.svelte -->
<!--
  Zuna — голос помічниці продукту.
  Використовуй скрізь, де "говорить" система: успіх, очікування, підказки.
  Завжди тепло, на «ти», від першої особи.
-->
<script lang="ts">
  interface Props {
    /** Текст від Zuna. Можна передати дітей замість тексту. */
    text?: string
    /** Розмір аватара в px. */
    size?: number
    /** Варіант: 'inline' — в рядок, 'card' — карточка-пузир. */
    variant?: 'inline' | 'card'
    /** Показувати імʼя "Zuna" над текстом. */
    showName?: boolean
    children?: import('svelte').Snippet
  }

  let {
    text,
    size = 40,
    variant = 'inline',
    showName = false,
    children,
  }: Props = $props()
</script>

{#if variant === 'card'}
  <div
    class="flex items-start gap-3 p-4 rounded-2xl"
    style="background-color: var(--secondary)"
  >
    <img
      src="/zuna-avatar.webp"
      alt="Zuna"
      width={size}
      height={size}
      loading="lazy"
      class="rounded-full shrink-0 object-cover"
      style="width: {size}px; height: {size}px"
    />
    <div class="min-w-0 flex-1 pt-0.5">
      {#if showName}
        <p
          class="text-xs font-semibold mb-0.5"
          style="color: var(--foreground)"
        >
          Zuna
        </p>
      {/if}
      <div class="text-sm leading-relaxed" style="color: var(--foreground)">
        {#if children}{@render children()}{:else}{text}{/if}
      </div>
    </div>
  </div>
{:else}
  <div class="flex items-center gap-2.5">
    <img
      src="/zuna-avatar.webp"
      alt="Zuna"
      width={size}
      height={size}
      loading="lazy"
      class="rounded-full shrink-0 object-cover"
      style="width: {size}px; height: {size}px"
    />
    <div class="min-w-0">
      {#if showName}
        <p class="text-xs font-semibold" style="color: var(--muted-foreground)">
          Zuna
        </p>
      {/if}
      <div class="text-sm leading-relaxed" style="color: var(--foreground)">
        {#if children}{@render children()}{:else}{text}{/if}
      </div>
    </div>
  </div>
{/if}
