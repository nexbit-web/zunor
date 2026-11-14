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
    /**
     * Широкий контрол (палітра акценту, мініатюри теми): поруч із
     * текстом стає лише на широкій картці, інакше — під ним. Діє в
     * stacked; в інших подачах рядок поводиться як завжди.
     */
    wide?: boolean
    /**
     * Кольорова плитка ліворуч від назви (SettingsTile) — як у рядках
     * налаштувань мобільного застосунку.
     */
    icon?: Snippet
    /** Контрол праворуч: перемикач, кнопка, статус. */
    control?: Snippet
  }

  let {
    label,
    description,
    for: htmlFor,
    wide = false,
    icon,
    control,
  }: Props = $props()

  // split: без картки, отже й без втоплення mx-4; перший рядок притиснутий
  // до верху, до назви розділу.
  // stacked: рядок картки ClickUp — свої поля всередині рамки, лінія між
  // рядками на всю ширину, «текст ліворуч, контрол праворуч» за шириною
  // картки (@container у SettingsGroup), а не вікна.
  const layout = getSettingsLayout()
  const split = layout === 'split'
  const stacked = layout === 'stacked'

  const rowClass = $derived(
    stacked
      ? wide
        ? 'gap-4 border-(--settings-line) px-5 py-4.5 @3xl:flex-row @3xl:items-center @3xl:justify-between @3xl:gap-10'
        : 'gap-3 border-(--settings-line) px-5 py-4.5 @lg:flex-row @lg:items-center @lg:justify-between @lg:gap-8'
      : split
        ? 'gap-3 border-border py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6'
        : 'mx-4 gap-3 border-border/60 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6'
  )

  const labelClass = stacked
    ? 'text-[15px] font-medium'
    : split
      ? 'text-[14px] font-medium'
      : 'text-sm font-medium'
  const descriptionClass = stacked
    ? 'mt-1 text-[13.5px] leading-[1.45]'
    : split
      ? 'mt-0.5 text-[13px] leading-relaxed'
      : 'mt-0.5 text-[12px] leading-relaxed'
  // Широкий контрол у вузькій картці — на всю ширину під текстом.
  const controlClass = $derived(stacked && wide ? 'w-full @3xl:w-auto' : '')
</script>

<!-- first:border-t-0: лінія між рядками. Рядок не знає, який він за
     рахунком — про це каже :first-child, тож сторінка не мусить
     розставляти модифікатори руками. -->
<div class="flex flex-col border-t first:border-t-0 {rowClass}">
  <div class="flex min-w-0 items-center gap-3.5">
    {#if icon}
      {@render icon()}
    {/if}

    <div class="min-w-0">
      {#if htmlFor}
        <label for={htmlFor} class="cursor-pointer {labelClass}">
          {label}
        </label>
      {:else}
        <p class={labelClass}>{label}</p>
      {/if}

      {#if description}
        <p class="text-muted-foreground {descriptionClass}">
          {description}
        </p>
      {/if}
    </div>
  </div>

  {#if control}
    <div class="shrink-0 {controlClass}">{@render control()}</div>
  {/if}
</div>
