<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    title?: string
    /** Пояснення під карткою — для застережень, а не для опису рядків. */
    footnote?: string
    children: Snippet
  }

  let { title, footnote, children }: Props = $props()
</script>

<section class="mb-8 last:mb-0">
  {#if title}
    <h2
      class="mb-3 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase"
    >
      {title}
    </h2>
  {/if}

  <!-- divide-y замість рамки в кожного рядка: волосяні лінії між
       рядками й одна рамка навколо групи — як у системних налаштуваннях. -->
  <div
    class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card"
  >
    {@render children()}
  </div>

  {#if footnote}
    <p class="mt-2 px-1 text-[12px] leading-relaxed text-muted-foreground">
      {footnote}
    </p>
  {/if}
</section>
