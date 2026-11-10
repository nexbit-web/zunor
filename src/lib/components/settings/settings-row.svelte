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

  // split і stacked: без картки, отже й без втоплення mx-4; перший рядок
  // притиснутий до верху, до назви розділу. У stacked підпис жирний, як
  // у полів GitHub, а лінія — тиха (--panel-border), як під заголовком.
  const layout = getSettingsLayout()
  const split = layout === 'split'
  const stacked = layout === 'stacked'

  const lineClass = stacked
    ? 'border-panel-border py-4 first:pt-0 last:pb-0'
    : split
      ? 'border-border py-4 first:pt-0 last:pb-0'
      : 'mx-4 border-border/60 py-3.5'
  const labelClass = stacked
    ? 'text-sm font-semibold'
    : split
      ? 'text-[14px] font-medium'
      : 'text-sm font-medium'
  const descriptionClass = stacked || split ? 'text-[13px]' : 'text-[12px]'
</script>

<!-- mx-4 + first:border-t-0: лінія між рядками, втоплена від країв картки.
     Рядок не знає, який він за рахунком — про це каже :first-child, тож
     сторінка не мусить розставляти модифікатори руками. -->
<div
  class="flex flex-col gap-3 border-t first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6 {lineClass}"
>
  <div class="min-w-0">
    {#if htmlFor}
      <label for={htmlFor} class="cursor-pointer {labelClass}">
        {label}
      </label>
    {:else}
      <p class={labelClass}>{label}</p>
    {/if}

    {#if description}
      <p
        class="mt-0.5 leading-relaxed text-muted-foreground {descriptionClass}"
      >
        {description}
      </p>
    {/if}
  </div>

  {#if control}
    <div class="shrink-0">{@render control()}</div>
  {/if}
</div>
