<!--
  Плитки вибору для анкети майстра: один варіант (radio) або кілька
  (checkbox). Ті самі плитки, що й у «Як далеко готові їздити»
  (travel-radius.svelte): рамка кольору поля, обраний — рамка primary.

  Під плиткою — нативний input: стрілки, Tab, пробіл і скрінрідер
  працюють самі, без ручного керування фокусом.
-->
<script lang="ts" generics="T extends string | boolean">
  import type { Component, Snippet } from 'svelte'
  import CheckIcon from '@lucide/svelte/icons/check'

  interface Option {
    value: T
    label: string
    hint?: string
    icon?: Component<{ class?: string }>
  }

  interface Props {
    options: readonly Option[]
    /** Імʼя групи input — унікальне на сторінці. */
    name: string
    /** Підпис групи для скрінрідера. */
    label: string
    /** Кілька варіантів (checkbox) замість одного (radio). */
    multiple?: boolean
    /** Обраний варіант — для одного. */
    value?: T | null
    /** Обрані варіанти — для кількох. */
    values?: T[]
    /** Своя іконка замість option.icon (наприклад, іконка послуги). */
    iconFor?: Snippet<[T]>
    columns?: 1 | 2 | 3
    invalid?: boolean
    onpick?: () => void
  }

  let {
    options,
    name,
    label,
    multiple = false,
    value = $bindable(null),
    values = $bindable([]),
    iconFor,
    columns = 2,
    invalid = false,
    onpick,
  }: Props = $props()

  const isOn = (v: T) => (multiple ? values.includes(v) : value === v)

  function pick(v: T): void {
    if (multiple) {
      // Порядок довідника, а не порядок кліків: так відповіді однакові в
      // базі й у підсумку на кроці перевірки.
      const next = values.includes(v)
        ? values.filter((x) => x !== v)
        : [...values, v]
      values = options.map((o) => o.value).filter((x) => next.includes(x))
    } else {
      value = v
    }
    onpick?.()
  }
</script>

<div
  class={[
    'grid gap-2',
    columns === 1 && 'grid-cols-1',
    columns === 2 && 'grid-cols-1 sm:grid-cols-2',
    columns === 3 && 'grid-cols-2 sm:grid-cols-3',
  ]}
  role={multiple ? 'group' : 'radiogroup'}
  aria-label={label}
  aria-invalid={invalid || undefined}
>
  {#each options as o (String(o.value))}
    {@const on = isOn(o.value)}
    <label class="tile" class:selected={on} class:invalid>
      <input
        type={multiple ? 'checkbox' : 'radio'}
        {name}
        checked={on}
        onchange={() => pick(o.value)}
        class="sr-only"
      />
      {#if iconFor || o.icon}
        <span class="tile-icon" aria-hidden="true">
          {#if iconFor}
            {@render iconFor(o.value)}
          {:else if o.icon}
            <o.icon class="size-5" />
          {/if}
        </span>
      {/if}
      <span class="min-w-0 flex-1">
        <span class="tile-title">{o.label}</span>
        {#if o.hint}
          <span class="tile-desc">{o.hint}</span>
        {/if}
      </span>
      {#if multiple}
        <span class="tile-check" aria-hidden="true">
          {#if on}<CheckIcon class="size-3.5" />{/if}
        </span>
      {/if}
    </label>
  {/each}
</div>

<style>
  .tile {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--input);
    border-radius: 10px;
    background: var(--background);
    cursor: pointer;
    transition:
      border-color 180ms ease,
      box-shadow 180ms ease,
      background-color 180ms ease;
  }

  .tile:hover {
    border-color: var(--input-hover);
  }

  .tile.selected {
    border-color: var(--primary);
    box-shadow: 0 0 0 0.5px var(--primary);
  }

  .tile.invalid:not(.selected) {
    border-color: color-mix(in srgb, var(--destructive) 55%, var(--input));
  }

  .tile:has(input:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  .tile-icon {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--muted);
    color: color-mix(in srgb, var(--foreground) 80%, transparent);
  }

  .tile-title {
    display: block;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.35;
  }

  .tile.selected .tile-title {
    color: var(--primary);
  }

  .tile-desc {
    display: block;
    margin-top: 2px;
    color: var(--muted-foreground);
    font-size: 13px;
    line-height: 1.4;
  }

  /* Квадратик-галочка для «кількох»: без нього плитки з кількома
     виборами нічим не відрізнялись би від radio. */
  .tile-check {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 18px;
    height: 18px;
    margin-top: 1px;
    border: 1px solid var(--input);
    border-radius: 5px;
    color: var(--primary-foreground);
    transition:
      background-color 180ms ease,
      border-color 180ms ease;
  }

  .tile.selected .tile-check {
    border-color: var(--primary);
    background: var(--primary);
  }
</style>
