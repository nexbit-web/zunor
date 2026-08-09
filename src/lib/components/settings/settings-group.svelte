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

<section class="mb-7 last:mb-0">
  {#if title}
    <h2 class="mb-2 px-1 text-sm font-semibold">{title}</h2>
  {/if}

  <!-- Картка без рамки на приглушеному фоні — та сама, що в онбордингу
       й завантажувачі портфоліо. Раніше тут була рамка з divide-y, і
       два розділи налаштувань виглядали як шматок іншого застосунку.
       py-1 у картці + mx-4 у рядках дають лінії, втоплені від країв:
       так робить iOS, і саме тому лінія не ріже заокруглення. -->
  <div class="rounded-xl bg-muted/40 py-1">
    {@render children()}
  </div>

  {#if footnote}
    <p class="mt-3 px-1 text-[12px] leading-relaxed text-muted-foreground">
      {footnote}
    </p>
  {/if}
</section>
