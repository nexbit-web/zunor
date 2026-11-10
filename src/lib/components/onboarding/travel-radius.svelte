<!--
  Як далеко майстер готовий їздити: чотири плитки-варіанти й під ними
  рядок про те, що саме це означає на карті («охоплює 9 районів: …»).
  Число кілометрів саме по собі нічого не каже людині, а назви сусідніх
  районів — одразу зрозумілі.

  Нативні radio під плитками: стрілки, Tab і скрінрідер працюють самі.
-->
<script lang="ts">
  import { TRAVEL_OPTIONS, type TravelRadius } from '$lib/geo/travel'
  import { districtsWithin, type District } from '$lib/geo/districts'
  import { pluralUk } from '$lib/utils/plural'

  interface Props {
    /** Райони міста майстра. */
    districts: readonly District[]
    /** Район майстра — від нього рахується охоплення. */
    district: string
    value?: TravelRadius
  }

  let { districts, district, value = $bindable(null) }: Props = $props()

  const PREVIEW = 3

  const coverage = $derived.by(() => {
    if (!district) return ''
    const all = districts.length
    if (value === null) {
      return `Усе місто й передмістя — ${all} ${pluralUk(all, 'район', 'райони', 'районів')}.`
    }
    // Свій район не перелічуємо: він очевидний і так.
    const near = districtsWithin(districts, district, value).filter(
      (d) => d.slug !== district,
    )
    if (near.length === 0) return 'Лише ваш район.'
    const names = near.slice(0, PREVIEW).map((d) => d.name)
    const rest = near.length - names.length
    return (
      `Ваш район і ще ${near.length} ${pluralUk(near.length, 'район', 'райони', 'районів')}: ` +
      names.join(', ') +
      (rest > 0 ? ` та ще ${rest}.` : '.')
    )
  })
</script>

<div
  class="grid grid-cols-2 gap-2"
  role="radiogroup"
  aria-label="Як далеко готові їздити"
>
  {#each TRAVEL_OPTIONS as o (o.label)}
    <label class="tile" class:selected={value === o.value}>
      <input
        type="radio"
        name="travel-radius"
        checked={value === o.value}
        onchange={() => (value = o.value)}
        class="sr-only"
      />
      <span class="tile-title">{o.label}</span>
      <span class="tile-desc">{o.hint}</span>
    </label>
  {/each}
</div>

{#if coverage}
  <p
    class="mt-3 text-[13px] leading-relaxed text-muted-foreground"
    aria-live="polite"
  >
    {coverage}
  </p>
{/if}

<style>
  /* Ті самі плитки, що на виборі ролі: рамка кольору поля, 8px, обраний
     варіант — рамка primary без другого кільця. */
  .tile {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 10px 12px;
    border: 1px solid var(--input);
    border-radius: 8px;
    background: var(--background);
    cursor: pointer;
    transition:
      border-color 180ms ease,
      box-shadow 180ms ease;
  }

  .tile:hover {
    border-color: var(--input-hover);
  }

  .tile.selected {
    border-color: var(--primary);
    box-shadow: 0 0 0 0.5px var(--primary);
  }

  .tile:has(input:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  .tile-title {
    font-size: 14px;
    font-weight: 600;
  }

  .tile.selected .tile-title {
    color: var(--primary);
  }

  .tile-desc {
    color: var(--muted-foreground);
    font-size: 13px;
    line-height: 1.4;
  }
</style>
