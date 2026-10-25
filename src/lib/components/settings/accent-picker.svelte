<script lang="ts">
  // Палітра акцентного кольору: кнопки, посилання, виділення.
  //
  // Кожен зразок несе власний data-accent і малює себе через bg-primary —
  // layout.css підставляє в нього потрібний --primary. Тому hex-ів тут
  // немає: колір зразка й колір, який отримає застосунок, — одне й те
  // саме правило, а не дві копії.

  import { Check } from 'lucide-svelte'
  import { cn } from '$lib/utils'
  import { ACCENTS, appearance } from '$lib/stores/appearance.svelte'
  import { nextRadioIndex } from './radio-keys'

  let buttons = $state<(HTMLButtonElement | undefined)[]>([])

  function handleKeydown(e: KeyboardEvent, index: number): void {
    const next = nextRadioIndex(e.key, index, ACCENTS.length)
    if (next === null) return

    e.preventDefault()
    appearance.setAccent(ACCENTS[next].id)
    buttons[next]?.focus()
  }
</script>

<div
  role="radiogroup"
  aria-label="Акцентний колір"
  class="flex flex-wrap gap-2.5 sm:gap-3"
>
  {#each ACCENTS as accent, i (accent.id)}
    {@const selected = appearance.accent === accent.id}
    <!-- ring без власного кольору бере ring-primary, тобто колір самого
         зразка: обрана плитка обведена своїм же кольором через проміжок. -->
    <button
      bind:this={buttons[i]}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={accent.label}
      title={accent.label}
      tabindex={selected ? 0 : -1}
      data-accent={accent.id}
      onclick={() => appearance.setAccent(accent.id)}
      onkeydown={(e) => handleKeydown(e, i)}
      class={cn(
        'swatch flex size-10 cursor-pointer items-center justify-center rounded-[8px] bg-primary text-white ring-primary ring-offset-2 ring-offset-background transition-[box-shadow,filter] outline-none hover:brightness-110 focus-visible:ring-2',
        selected && 'ring-2',
      )}
    >
      {#if selected}
        <Check class="size-4" strokeWidth={3} aria-hidden="true" />
      {/if}
    </button>
  {/each}
</div>

<style>
  /* «Чорно-білий» показуємо сірим: чорна плитка зникла б на темному тлі,
     біла — на світлому. Сам акцент при цьому чорний або білий. Рамка
     обраної лишається кольору акценту — її видно на будь-якому тлі. */
  .swatch[data-accent='mono'] {
    background-color: #545b66;
  }
</style>
