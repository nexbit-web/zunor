<script lang="ts">
  // Рядок «підпис + пояснення ліворуч, контрол праворуч».
  // Для полів форми (інпут праворуч) є SettingsField — там інша поведінка
  // на вузьких екранах.
  import type { Snippet } from 'svelte'

  interface Props {
    label: string
    description?: string
    /** id контрола — щоб клік по підпису фокусував саме його. */
    for?: string
    /** Контрол праворуч: перемикач, кнопка, статус. */
    control?: Snippet
  }

  let { label, description, for: htmlFor, control }: Props = $props()
</script>

<!-- mx-4 + first:border-t-0: лінія між рядками, втоплена від країв картки.
     Рядок не знає, який він за рахунком — про це каже :first-child, тож
     сторінка не мусить розставляти модифікатори руками. -->
<div
  class="mx-4 flex flex-col gap-3 border-t border-border/60 py-3.5 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
>
  <div class="min-w-0">
    {#if htmlFor}
      <label for={htmlFor} class="cursor-pointer text-sm font-medium">
        {label}
      </label>
    {:else}
      <p class="text-sm font-medium">{label}</p>
    {/if}

    {#if description}
      <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
        {description}
      </p>
    {/if}
  </div>

  {#if control}
    <div class="shrink-0">{@render control()}</div>
  {/if}
</div>
