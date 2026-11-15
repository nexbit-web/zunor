<script lang="ts">
  // Поле форми: підпис (і за потреби підказка) та контрол.
  //
  // Ширина колонки з контролом (`sm:w-[56%] sm:max-w-75`) і поведінка
  // «на вузькому екрані стовпчиком» були скопійовані в кожне поле розділів
  // «Безпека» та «AI асистент» — сім разів однаковим довгим рядком класів.
  // Одна з копій уже встигла розійтись у записі (`max-w-[300px]` проти
  // `max-w-75` — те саме число, але шукати збіг доводилось очима).
  import type { Snippet } from 'svelte'
  import CircleAlert from '$lib/components/icons/set/circle-alert.svelte'
  import { getSettingsLayout } from './layout'
  import FieldHint from './field-hint.svelte'

  interface Props {
    label: string
    /**
     * Підказка: обмеження, формат, хто це побачить. Показується іконкою
     * біля підпису з тултипом, а не рядком під ним; у stacked — сірим
     * текстом під підписом, як пояснення в рядках ClickUp.
     */
    hint?: string
    /**
     * id контрола — щоб клік по підпису фокусував саме його.
     * Без нього підпис рендериться звичайним текстом: <label>, який нікуди
     * не веде, лише збиває скрінрідер. Так буває у полів без одного
     * фокусованого елемента — завантажувач фото, комбобокс міста.
     */
    for?: string
    /** Повідомлення про помилку під контролом. */
    error?: string
    control: Snippet
  }

  let { label, hint, for: htmlFor, error, control }: Props = $props()

  const layout = getSettingsLayout()
  const split = layout === 'split'
  const stacked = layout === 'stacked'

  const captionClass = stacked
    ? 'text-[15px] font-medium'
    : split
      ? 'text-[14px] font-medium'
      : 'text-sm font-normal'
</script>

<!-- Підпис і іконка підказки в один рядок. Кнопка підказки — поруч із
     <label>, а не всередині: клік по ній інакше ще й фокусував би поле. -->
{#snippet caption()}
  <span class="inline-flex items-center gap-1.5">
    {#if htmlFor}
      <label for={htmlFor} class="cursor-pointer {captionClass}">
        {label}
      </label>
    {:else}
      <span class={captionClass}>{label}</span>
    {/if}

    {#if hint && !stacked}
      <FieldHint text={hint} />
    {/if}
  </span>
{/snippet}

<!-- Помилка однакова в обох подачах. Іконка поруч із текстом: червоний
     колір сам по собі не повідомлення для того, хто його не розрізняє. -->
{#snippet errorLine()}
  {#if error}
    <p
      class="mt-1.5 flex items-center gap-1.5 text-[12px] font-normal text-destructive"
      role="alert"
    >
      <CircleAlert class="size-3.5 shrink-0" aria-hidden="true" />
      {error}
    </p>
  {/if}
{/snippet}

{#if stacked}
  <!-- Рядок картки ClickUp, як SettingsRow: підпис і підказка ліворуч
       (підказка — сірим текстом під підписом, як пояснення в рядках
       ClickUp; тултип тут лише ховав би її), поле праворуч шириною 400px.
       На вузькій картці — стовпчиком, поле на всю ширину: ширина
       рахується від картки (@container у SettingsGroup). -->
  <div
    class="flex flex-col gap-2.5 border-t border-(--settings-line) px-5 py-4.5 first:border-t-0 @2xl:flex-row @2xl:items-start @2xl:justify-between @2xl:gap-8"
  >
    <div class="min-w-0 @2xl:pt-2">
      {@render caption()}

      {#if hint}
        <p class="mt-1 text-[13.5px] leading-[1.45] text-muted-foreground">
          {hint}
        </p>
      {/if}
    </div>

    <div class="w-full @2xl:w-100 @2xl:shrink-0">
      {@render control()}
      {@render errorLine()}
    </div>
  </div>
{:else if split}
  <!-- Підпис НАД полем, як у ClickUp: права колонка розділу вузька, і
       «підпис ліворуч» стиснув би поле до половини. Ліній між полями
       немає — їх розділяє повітря. -->
  <div class="py-2.5 first:pt-0 last:pb-0">
    {@render caption()}

    <div class="mt-2">
      {@render control()}
      {@render errorLine()}
    </div>
  </div>
{:else}
  <div
    class="mx-4 flex flex-col gap-2 border-t border-border/60 py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
  >
    <div class="min-w-0 sm:pt-1.5">
      {@render caption()}
    </div>

    <div class="w-full sm:w-[56%] sm:max-w-75 sm:shrink-0">
      {@render control()}
      {@render errorLine()}
    </div>
  </div>
{/if}
