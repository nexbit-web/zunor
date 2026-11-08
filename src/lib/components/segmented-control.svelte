<!--
  Перемикач-«пігулка» (Усі / Непрочитані), як у Telegram.

  Підкладка під активним пунктом переїжджає «гумово»: передній край рушає
  першим і швидко, задній наздоганяє мʼякшою пружиною з легким
  перельотом. У дорозі підкладка розтягується майже на обидва пункти, а на
  місці коротко стискається й завмирає.

  Краї — дві окремі пружини (Spring), а не CSS-перехід: пружина підхоплює
  рух із тієї точки, де він зараз, тож швидкі кліки туди-сюди не смикають
  підкладку, а плавно розвертають її.
-->
<script lang="ts" generics="T extends string">
  import { untrack } from 'svelte'
  import { Spring, prefersReducedMotion } from 'svelte/motion'
  import { nextRadioIndex } from '$lib/components/settings/radio-keys'

  type Option = { value: T; label: string; count?: number }

  let {
    options,
    value = $bindable(),
    label,
  }: {
    options: readonly Option[]
    value: T
    /** Підпис групи для скрінрідера: «Які чати показати». */
    label: string
  } = $props()

  const index = $derived(
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  )
  /** Ширина одного пункту у відсотках. */
  const step = $derived(100 / options.length)

  // Числа звірені симуляцією пружини Svelte: передній край доходить за
  // ~120 мс, задній — за ~300 мс із перельотом ~3%, тож підкладка в дорозі
  // розтягується до ~70% ширини, а на фініші ледь стискається.
  const LEAD = { stiffness: 0.28, damping: 0.75 }
  const TRAIL = { stiffness: 0.08, damping: 0.35 }

  // untrack: пружини стартують із ПОЧАТКОВОЇ позиції, далі їх веде ефект.
  const left = new Spring(
    untrack(() => index * step),
    LEAD,
  )
  const right = new Spring(
    untrack(() => 100 - (index + 1) * step),
    LEAD,
  )

  let from = untrack(() => index)

  // Від зміни індексу, а не від кліку: value приходить через bind і може
  // змінитись ззовні (скинули фільтр) — підкладка має поїхати й тоді.
  $effect(() => {
    const to = index
    if (to === from) return

    // Їдемо праворуч — веде правий край, лівий наздоганяє; і навпаки.
    const forward = to > from
    const lead = forward ? right : left
    const trail = forward ? left : right
    lead.stiffness = LEAD.stiffness
    lead.damping = LEAD.damping
    trail.stiffness = TRAIL.stiffness
    trail.damping = TRAIL.damping

    const instant = prefersReducedMotion.current
    left.set(to * step, { instant })
    right.set(100 - (to + 1) * step, { instant })
    from = to
  })

  // Посилання на кнопки — щоб стрілки могли переносити фокус.
  let buttons = $state<(HTMLButtonElement | undefined)[]>([])

  function handleKeydown(e: KeyboardEvent, i: number): void {
    const next = nextRadioIndex(e.key, i, options.length)
    if (next === null) return

    e.preventDefault()
    value = options[next].value
    buttons[next]?.focus()
  }
</script>

<!-- Roving tabindex: у групу один вхід табом, далі стрілками. -->
<div
  role="radiogroup"
  aria-label={label}
  class="flex h-11 rounded-full bg-background p-1 shadow-[0_1px_3px_rgb(0_0_0/0.06)] ring-1 ring-border/70"
>
  <div class="relative flex flex-1">
    <span
      class="absolute inset-y-0 rounded-full bg-primary/10 dark:bg-primary/20"
      style:left="{left.current}%"
      style:right="{right.current}%"
      aria-hidden="true"
    ></span>

    {#each options as option, i (option.value)}
      {@const selected = option.value === value}
      <button
        bind:this={buttons[i]}
        type="button"
        role="radio"
        aria-checked={selected}
        tabindex={selected ? 0 : -1}
        onclick={() => (value = option.value)}
        onkeydown={(e) => handleKeydown(e, i)}
        class={[
          'relative flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 text-[15px] font-medium transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
          selected ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        ]}
      >
        <span class="truncate">{option.label}</span>
        {#if option.count}
          <span
            class={[
              'inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums transition-colors duration-200',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted-foreground/15 text-muted-foreground',
            ]}
          >
            {option.count > 99 ? '99+' : option.count}
          </span>
        {/if}
      </button>
    {/each}
  </div>
</div>
