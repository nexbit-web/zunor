<!--
  Огляд: головні метрики за період. Перші три — швидкість відгуку
  (MANIFESTO, правило №2), далі обсяг. Цифри — плитками (одне число не
  потребує графіка), ритм заявок по днях — одним рядом стовпчиків.
-->
<script lang="ts">
  import { PERIODS, PERIOD_LABEL, type Period } from '$lib/admin/periods'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
  const m = $derived(data.metrics)

  function duration(minutes: number | null): string {
    if (minutes === null) return '—'
    if (minutes < 60) return `${minutes} хв`
    const h = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest ? `${h} год ${rest} хв` : `${h} год`
  }

  function percent(share: number | null): string {
    return share === null ? '—' : `${Math.round(share * 100)}%`
  }

  const tiles = $derived([
    {
      label: 'Перший відгук',
      value: duration(m.ttfrMinutes),
      hint: 'Медіана від заявки до першої пропозиції',
    },
    {
      label: 'Відгук за 10 хв',
      value: percent(m.fill10),
      hint: 'Частка заявок із пропозицією за 10 хвилин',
    },
    {
      label: 'Без жодного відгуку',
      value: percent(m.noResponse),
      hint: 'Серед заявок, старших за добу',
    },
    { label: 'Заявки', value: String(m.jobs), hint: 'Створено за період' },
    {
      label: 'Завершені замовлення',
      value: String(m.ordersCompleted),
      hint: 'Завершено за період',
    },
    {
      label: 'Активні майстри',
      value: String(m.activeMasters),
      hint: 'Заходили за останній тиждень',
    },
    {
      label: 'Нові клієнти',
      value: String(m.newClients),
      hint: 'Зареєструвались за період',
    },
    {
      label: 'Нові майстри',
      value: String(m.newMasters),
      hint: 'Зареєструвались за період',
    },
  ])

  const maxPerDay = $derived(Math.max(1, ...m.perDay.map((d) => d.jobs)))

  const dayFmt = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' })
  const dayLabel = (iso: string) => dayFmt.format(new Date(`${iso}T12:00:00`))
</script>

<svelte:head><title>Огляд · Адмінка Zunor</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-3">
  <h1 class="text-2xl font-semibold tracking-tight">Огляд</h1>
  <nav aria-label="Період" class="flex rounded-lg bg-muted p-0.5">
    {#each Object.keys(PERIODS) as key (key)}
      {@const k = key as Period}
      <a
        href="?period={k}"
        aria-current={m.period === k ? 'true' : undefined}
        class={[
          'rounded-md px-3 py-1.5 text-[13.5px] transition-colors',
          m.period === k
            ? 'bg-card font-medium text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        ]}
      >
        {PERIOD_LABEL[k]}
      </a>
    {/each}
  </nav>
</div>

{#if m.capped}
  <p class="mt-3 text-[13px] text-muted-foreground">
    Заявок за період забагато — цифри пораховано за останніми 5000.
  </p>
{/if}

<ul class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
  {#each tiles as t (t.label)}
    <li class="rounded-xl border border-border bg-card px-4 py-3.5">
      <p class="text-[13px] text-muted-foreground">{t.label}</p>
      <p class="mt-1 text-[26px] leading-tight font-semibold tracking-tight tabular-nums">
        {t.value}
      </p>
      <p class="mt-1 text-[12px] leading-snug text-muted-foreground">{t.hint}</p>
    </li>
  {/each}
</ul>

<section class="mt-8 rounded-xl border border-border bg-card px-4 py-4 sm:px-5">
  <h2 class="text-[15px] font-medium">Заявки по днях</h2>

  <!-- Одна серія — без легенди: заголовок називає її. Кожен стовпчик —
       з підписом для скрінрідера й підказкою під курсором. -->
  <div class="relative mt-4 flex h-40 items-end gap-[2px]" role="list">
    {#each m.perDay as d (d.date)}
      <div
        class="group relative flex h-full min-w-0 flex-1 items-end"
        role="listitem"
        aria-label="{dayLabel(d.date)}: {d.jobs}"
      >
        <div
          class="w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
          style:height="{d.jobs ? Math.max(4, (d.jobs / maxPerDay) * 100) : 0}%"
        ></div>
        {#if !d.jobs}
          <div class="absolute bottom-0 h-px w-full bg-border"></div>
        {/if}
        <span
          class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-[12px] whitespace-nowrap text-background group-hover:block"
        >
          {dayLabel(d.date)} · {d.jobs}
        </span>
      </div>
    {/each}
  </div>
  <div class="mt-2 flex justify-between text-[12px] text-muted-foreground">
    <span>{dayLabel(m.perDay[0].date)}</span>
    <span>{dayLabel(m.perDay[m.perDay.length - 1].date)}</span>
  </div>
</section>
