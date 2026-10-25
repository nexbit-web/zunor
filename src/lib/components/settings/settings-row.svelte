<script lang="ts">
  // Рядок «підпис + пояснення ліворуч, контрол праворуч».
  // Для полів форми (інпут праворуч) є SettingsField — там інша поведінка
  // на вузьких екранах.
  import type { Snippet } from 'svelte'
  import { getSettingsLayout } from './layout'

  interface Props {
    label: string
    description?: string
    /** id контрола — щоб клік по підпису фокусував саме його. */
    for?: string
    /** Контрол праворуч: перемикач, кнопка, статус. */
    control?: Snippet
  }

  let { label, description, for: htmlFor, control }: Props = $props()

  // split: без картки, отже й без втоплення mx-4; перший рядок
  // притиснутий до верху, щоб стати врівень із назвою розділу ліворуч.
  const split = getSettingsLayout() === 'split'
</script>

<!-- mx-4 + first:border-t-0: лінія між рядками, втоплена від країв картки.
     Рядок не знає, який він за рахунком — про це каже :first-child, тож
     сторінка не мусить розставляти модифікатори руками. -->
<div
  class="flex flex-col gap-3 border-t first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6 {split
    ? 'border-border py-4 first:pt-0 last:pb-0'
    : 'mx-4 border-border/60 py-3.5'}"
>
  <div class="min-w-0">
    {#if htmlFor}
      <label
        for={htmlFor}
        class="cursor-pointer font-medium {split ? 'text-[14px]' : 'text-sm'}"
      >
        {label}
      </label>
    {:else}
      <p class="font-medium {split ? 'text-[14px]' : 'text-sm'}">{label}</p>
    {/if}

    {#if description}
      <p
        class="mt-0.5 leading-relaxed text-muted-foreground {split
          ? 'text-[13px]'
          : 'text-[12px]'}"
      >
        {description}
      </p>
    {/if}
  </div>

  {#if control}
    <div class="shrink-0">{@render control()}</div>
  {/if}
</div>
