<script lang="ts">
  import type { Snippet } from 'svelte'
  import { getSettingsLayout } from './layout'

  interface Props {
    title?: string
    /**
     * Пояснення до розділу. У картці — виноска під нею (застереження),
     * у split — опис під назвою в лівій колонці, у stacked — під
     * заголовком, над лінією.
     */
    footnote?: string
    children: Snippet
  }

  let { title, footnote, children }: Props = $props()

  const layout = getSettingsLayout()
</script>

{#if layout === 'stacked'}
  <!-- Як розділ налаштувань GitHub (Subhead): заголовок і пояснення,
       під ними лінія, далі поля одне під одним. Перший розділ без
       відступу зверху — над ним заголовок сторінки. -->
  <section class="mt-10 first:mt-0">
    {#if title || footnote}
      <div class="mb-4 {title ? 'border-b border-panel-border pb-2' : ''}">
        {#if title}
          <h2 class="text-xl font-normal tracking-[-0.01em]">{title}</h2>
        {/if}
        {#if footnote}
          <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
            {footnote}
          </p>
        {/if}
      </div>
    {/if}

    <!-- Окрема обгортка: рядки й поля рахують себе першими (first:) серед
         сусідів, і без неї першим був би заголовок — під його лінією
         стала б друга, від першого рядка. -->
    <div>
      {@render children()}
    </div>
  </section>
{:else if layout === 'split'}
  <!-- Назва з поясненням ліворуч, поля праворуч. Лінія між розділами
       на всю ширину; перший розділ її не має — над ним заголовок
       сторінки. Розділ без назви лишає ліву колонку порожньою, щоб поля
       стояли на тій самій вертикалі, що й у сусідніх розділах. -->
  <section
    class="grid gap-x-12 gap-y-4 border-t border-border py-8 first:border-t-0 first:pt-0 last:pb-0 @2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
  >
    <div class="min-w-0">
      {#if title}
        <h2 class="text-[15px] font-semibold">{title}</h2>
      {/if}
      {#if footnote}
        <p class="mt-1 text-[14px] leading-relaxed text-muted-foreground">
          {footnote}
        </p>
      {/if}
    </div>

    <div class="min-w-0">
      {@render children()}
    </div>
  </section>
{:else}
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
{/if}
