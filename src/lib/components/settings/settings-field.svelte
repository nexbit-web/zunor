<script lang="ts">
  // Поле форми: підпис (і за потреби пояснення) ліворуч, контрол праворуч.
  //
  // Ширина колонки з контролом (`sm:w-[56%] sm:max-w-75`) і поведінка
  // «на вузькому екрані стовпчиком» були скопійовані в кожне поле розділів
  // «Безпека» та «AI асистент» — сім разів однаковим довгим рядком класів.
  // Одна з копій уже встигла розійтись у записі (`max-w-[300px]` проти
  // `max-w-75` — те саме число, але шукати збіг доводилось очима).
  import type { Snippet } from 'svelte'

  interface Props {
    label: string
    /** Підказка під підписом: обмеження, приклад, формат. */
    hint?: string
    /** id контрола — щоб клік по підпису фокусував саме його. */
    for?: string
    /** Повідомлення про помилку під контролом. */
    error?: string
    control: Snippet
  }

  let { label, hint, for: htmlFor, error, control }: Props = $props()
</script>

<div
  class="mx-4 flex flex-col gap-2 border-t border-border/60 py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
>
  <div class="min-w-0 sm:pt-1.5">
    <label for={htmlFor} class="text-sm font-normal">{label}</label>
    {#if hint}
      <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
        {hint}
      </p>
    {/if}
  </div>

  <div class="w-full sm:w-[56%] sm:max-w-75 sm:shrink-0">
    {@render control()}

    {#if error}
      <p class="mt-1.5 text-[12px] text-destructive" role="alert">{error}</p>
    {/if}
  </div>
</div>
