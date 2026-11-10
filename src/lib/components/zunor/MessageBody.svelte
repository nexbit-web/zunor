<script lang="ts">
  // Рендер тіла повідомлення Zunor. Розбір мікроформату — у
  // $lib/zunor/message-format (там і сам протокол); тут лише розмітка.
  //
  // Текст моделі — недовірений ввід: у DOM він потрапляє лише через
  // текстові вузли Svelte, {@html} немає — XSS неможливий за побудовою.
  // Рядок >>> сюди не доходить: його ріже visibleText/extractSuggestions.
  //
  // «— » і «1. » у тексті — лише ПРОТОКОЛ. Маркери малює компонент:
  // крапка кольору primary і номер у кружечку.
  //
  // typing: курсор друку рендериться ВСЕРЕДИНІ останнього блока.
  import { parseMessage, type Span } from '$lib/zunor/message-format'

  let { text, typing = false }: { text: string; typing?: boolean } = $props()

  const blocks = $derived(parseMessage(text))
</script>

{#snippet cursor()}
  <span
    class="ml-0.5 -mb-0.5 inline-block h-3.75 w-0.5 animate-pulse bg-foreground/50"
  ></span>
{/snippet}

{#snippet inline(spans: Span[])}
  {#each spans as span, k (k)}
    {#if span.strong}<strong class="font-semibold text-foreground"
        >{span.text}</strong
      >{:else}{span.text}{/if}
  {/each}
{/snippet}

<div
  class="space-y-3 text-[15.5px] leading-[1.7] wrap-break-word text-foreground"
>
  {#each blocks as block, i (i)}
    {@const isLast = i === blocks.length - 1}
    {#if block.kind === 'list'}
      {@const ordered = block.ordered}
      <svelte:element
        this={ordered ? 'ol' : 'ul'}
        class="space-y-1.5"
        start={block.ordered ? block.start : undefined}
      >
        {#each block.items as item, j (j)}
          <li class="flex gap-2.5">
            {#if block.ordered}
              <span
                class="mt-[0.3em] flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11.5px] font-semibold text-muted-foreground tabular-nums"
                aria-hidden="true">{block.start + j}</span
              >
            {:else}
              <span
                class="mt-[0.72em] size-1.5 shrink-0 rounded-full bg-primary"
                aria-hidden="true"
              ></span>
            {/if}
            <span class="min-w-0"
              ><!-- Пробіл після тире — виразом: пробільні символи перед
                   {/if} Svelte обрізає, і виходило «Тварини —чи є». -->{#if item.term}<span
                  class="font-medium">{item.term}</span
                >&nbsp;—{' '}{/if}{@render inline(
                item.spans,
              )}{#if typing && isLast && j === block.items.length - 1}{@render cursor()}{/if}</span
            >
          </li>
        {/each}
      </svelte:element>
    {:else}
      <p>
        {@render inline(
          block.spans,
        )}{#if typing && isLast}{@render cursor()}{/if}
      </p>
    {/if}
  {/each}
  {#if typing && !blocks.length}
    {@render cursor()}
  {/if}
</div>
