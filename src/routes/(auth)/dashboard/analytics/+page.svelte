<!-- src/routes/(auth)/dashboard/analytics/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { BarChart3, CalendarDays, Star } from 'lucide-svelte'
  import {
    CalendarDate,
    getLocalTimeZone,
    today,
    type DateValue,
  } from '@internationalized/date'
  import type { DateRange } from 'bits-ui'
  import { Button } from '$lib/components/ui/button'
  import { Card, CardContent } from '$lib/components/ui/card'
  import * as Popover from '$lib/components/ui/popover'
  import { RangeCalendar } from '$lib/components/ui/range-calendar'
  import { formatMoney } from '$lib/orders/labels'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  const p = $derived(data.proposals)
  const o = $derived(data.orders)

  // ─── Період ───

  /** 'YYYY-MM-DD' → CalendarDate. Календар працює з календарними датами,
   *  без годин і зон — рівно тим, що лежить в адресі. */
  function toCalendarDate(iso: string): CalendarDate {
    const [y, m, d] = iso.split('-').map(Number)
    return new CalendarDate(y, m, d)
  }

  function toIso(d: DateValue): string {
    return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
  }

  // Значення календаря — $derived від того, що повернув сервер. Власного
  // $state тут бути не повинно: період живе в URL, а сторінка його лише
  // показує. Інакше після «назад» календар показував би старий діапазон.
  const range = $derived<DateRange>({
    start: toCalendarDate(data.period.from),
    end: toCalendarDate(data.period.to),
  })

  let pickerOpen = $state(false)

  function applyRange(next: DateRange | undefined): void {
    if (!next?.start || !next?.end) return
    pickerOpen = false
    void goto(`?from=${toIso(next.start)}&to=${toIso(next.end)}`, {
      keepFocus: true,
      noScroll: true,
    })
  }

  /** Скидання на поточний місяць — це просто адреса без параметрів:
   *  сервер сам порахує межі місяця на момент запиту. */
  function resetToCurrentMonth(): void {
    pickerOpen = false
    void goto('?', { keepFocus: true, noScroll: true })
  }

  function shiftMonths(offset: number): void {
    const t = today(getLocalTimeZone())
    const first = new CalendarDate(t.year, t.month, 1).add({ months: offset })
    const last = first.add({ months: 1 }).subtract({ days: 1 })
    applyRange({ start: first, end: last })
  }

  const periodLabel = $derived.by(() => {
    if (data.period.isCurrentMonth) return 'Цей місяць'
    const fmt = new Intl.DateTimeFormat('uk-UA', {
      day: 'numeric',
      month: 'short',
    })
    const from = fmt.format(new Date(`${data.period.from}T00:00:00Z`))
    const to = fmt.format(new Date(`${data.period.to}T00:00:00Z`))
    return from === to ? from : `${from} — ${to}`
  })

  // ─── Форматери ───

  /** Відсоток. null означає «нема з чого рахувати» — і тоді прочерк, а не
   *  0%: нуль читався б як провал, а не як брак даних. */
  function percent(value: number | null): string {
    return value === null ? '—' : `${Math.round(value * 100)}%`
  }

  function duration(minutes: number | null): string {
    if (minutes === null) return '—'
    if (minutes < 1) return 'менше хвилини'
    if (minutes < 60) return `${Math.round(minutes)} хв`
    const hours = minutes / 60
    if (hours < 24) {
      const h = Math.floor(hours)
      const m = Math.round(minutes - h * 60)
      return m > 0 ? `${h} год ${m} хв` : `${h} год`
    }
    return `${Math.round(hours / 24)} дн`
  }

  // Співвідношення обрано / відхилено / чекають однією смугою: три числа
  // поруч читаються довше, ніж одна пропорція.
  const bar = $derived.by(() => {
    const shown = p.accepted + p.rejected + p.pending
    if (shown === 0) return null
    return {
      accepted: (p.accepted / shown) * 100,
      rejected: (p.rejected / shown) * 100,
      pending: (p.pending / shown) * 100,
    }
  })

  const kpis = $derived([
    {
      label: 'Конверсія',
      value: percent(p.conversion),
      hint:
        p.conversion === null
          ? 'Ще нема вирішених відгуків'
          : `${p.accepted} з ${p.accepted + p.rejected} вирішених`,
    },
    {
      label: 'Зароблено',
      value: formatMoney(data.money.earnedCents),
      hint: `${o.completed} завершених замовлень`,
    },
    {
      label: 'Середній чек',
      value: formatMoney(data.money.avgCheckCents),
      hint: `Середня ціна у відгуку — ${formatMoney(p.avgPriceCents)}`,
    },
    {
      label: 'Рейтинг',
      value: data.rating.count > 0 ? data.rating.value.toFixed(1) : '—',
      hint:
        data.rating.count > 0
          ? `${data.rating.count} оцінок · за весь час`
          : 'Ще нема оцінок',
    },
  ])

  const row =
    'flex items-center justify-between border-b border-border/60 py-2.5 last:border-b-0'
</script>

<svelte:head>
  <title>Аналітика · Zunor</title>
</svelte:head>

<div class="mx-auto flex min-h-svh w-full max-w-230 flex-col px-4 py-8 sm:px-6">
  <header class="mb-6 flex items-center justify-between gap-3 sm:mb-8">
    <div class="flex min-w-0 items-center gap-2.5">
      <h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
        Аналітика
      </h1>
      {#if data.rating.count > 0}
        <span
          class="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary"
        >
          <Star class="size-3 fill-current" />
          {data.rating.value.toFixed(1)}
        </span>
      {/if}
    </div>

    <Popover.Root bind:open={pickerOpen}>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button {...props} variant="secondary" size="sm" class="shrink-0">
            <CalendarDays />
            <span class="font-medium">{periodLabel}</span>
          </Button>
        {/snippet}
      </Popover.Trigger>

      <Popover.Content align="end" class="w-auto p-0">
        <div class="flex flex-wrap gap-1.5 border-b border-border/60 p-2">
          <Button
            variant={data.period.isCurrentMonth ? 'secondary' : 'ghost'}
            size="xs"
            onclick={resetToCurrentMonth}
          >
            Цей місяць
          </Button>
          <Button variant="ghost" size="xs" onclick={() => shiftMonths(-1)}>
            Минулий місяць
          </Button>
        </div>

        <RangeCalendar
          value={range}
          onValueChange={applyRange}
          locale="uk-UA"
          maxValue={today(getLocalTimeZone())}
        />
      </Popover.Content>
    </Popover.Root>
  </header>

  {#if !data.hasData}
    <div
      class="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center"
    >
      <BarChart3 class="size-14 text-muted-foreground/70" strokeWidth={1} />
      <h2 class="mt-6 text-lg font-medium">
        {data.period.isCurrentMonth
          ? 'Цього місяця поки порожньо'
          : 'За цей період нічого не було'}
      </h2>
      <p class="mt-2 max-w-90 text-sm leading-relaxed text-muted-foreground">
        {data.period.isCurrentMonth
          ? 'Відгукніться на заявку — і тут зʼявиться ваша конверсія, заробіток і середній чек.'
          : 'Спробуйте інший проміжок часу.'}
      </p>
      {#if !data.period.isCurrentMonth}
        <Button
          variant="secondary"
          size="sm"
          class="mt-6"
          onclick={resetToCurrentMonth}
        >
          Показати цей місяць
        </Button>
      {/if}
    </div>
  {:else}
    <!-- ─── Головні числа ─── -->
    <div class="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {#each kpis as kpi (kpi.label)}
        <Card size="sm" class="gap-0 rounded-2xl">
          <CardContent>
            <p class="text-xs text-muted-foreground">{kpi.label}</p>
            <p
              class="mt-1.5 text-2xl leading-none font-semibold tabular-nums text-foreground"
            >
              {kpi.value}
            </p>
            <p class="mt-2 text-[11px] leading-snug text-muted-foreground">
              {kpi.hint}
            </p>
          </CardContent>
        </Card>
      {/each}
    </div>

    <div class="grid gap-3 lg:grid-cols-2">
      <!-- ─── Відгуки ─── -->
      <Card size="sm" class="rounded-2xl">
        <CardContent>
          <div class="mb-4 flex items-baseline justify-between gap-2">
            <h2 class="text-sm font-semibold text-foreground">Відгуки</h2>
            <span class="text-sm tabular-nums text-muted-foreground">
              {p.total} за період
            </span>
          </div>

          {#if bar}
            <div class="mb-4 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
              {#if bar.accepted > 0}
                <div
                  class="bg-emerald-500"
                  style="width: {bar.accepted}%"
                ></div>
              {/if}
              {#if bar.rejected > 0}
                <div
                  class="bg-muted-foreground/30"
                  style="width: {bar.rejected}%"
                ></div>
              {/if}
              {#if bar.pending > 0}
                <div class="bg-amber-500" style="width: {bar.pending}%"></div>
              {/if}
            </div>
          {/if}

          <dl class="text-sm">
            <div class={row}>
              <dt class="flex items-center gap-2 text-muted-foreground">
                <span class="size-1.5 rounded-full bg-emerald-500"></span>
                Обрали вас
              </dt>
              <dd class="font-medium tabular-nums">{p.accepted}</dd>
            </div>
            <div class={row}>
              <dt class="flex items-center gap-2 text-muted-foreground">
                <span class="size-1.5 rounded-full bg-muted-foreground/30"
                ></span>
                Обрали іншого
              </dt>
              <dd class="font-medium tabular-nums">{p.rejected}</dd>
            </div>
            <div class={row}>
              <dt class="flex items-center gap-2 text-muted-foreground">
                <span class="size-1.5 rounded-full bg-amber-500"></span>
                Чекають рішення
              </dt>
              <dd class="font-medium tabular-nums">{p.pending}</dd>
            </div>
            {#if p.withdrawn > 0}
              <div class={row}>
                <dt class="text-muted-foreground">Ви відкликали</dt>
                <dd class="font-medium tabular-nums">{p.withdrawn}</dd>
              </div>
            {/if}
          </dl>
        </CardContent>
      </Card>

      <!-- ─── Замовлення ─── -->
      <Card size="sm" class="rounded-2xl">
        <CardContent>
          <div class="mb-4 flex items-baseline justify-between gap-2">
            <h2 class="text-sm font-semibold text-foreground">Замовлення</h2>
            <span class="text-sm tabular-nums text-muted-foreground">
              {o.completed + o.cancelled} закрито
            </span>
          </div>

          <dl class="text-sm">
            <div class={row}>
              <dt class="text-muted-foreground">Завершено</dt>
              <dd class="font-medium tabular-nums">{o.completed}</dd>
            </div>
            <div class={row}>
              <dt class="text-muted-foreground">Скасовано</dt>
              <dd class="font-medium tabular-nums">{o.cancelled}</dd>
            </div>
            <div class={row}>
              <dt class="text-muted-foreground">Доведено до кінця</dt>
              <dd class="font-medium tabular-nums">{percent(o.finishRate)}</dd>
            </div>
            <div class={row}>
              <dt class="text-muted-foreground">
                Зараз у роботі
                <span class="text-[11px] opacity-70"
                  >· незалежно від періоду</span
                >
              </dt>
              <dd class="font-medium tabular-nums">
                {o.active}
                {#if data.money.inWorkCents > 0}
                  <span class="ml-1 font-normal text-muted-foreground">
                    · {formatMoney(data.money.inWorkCents)}
                  </span>
                {/if}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>

    <!-- ─── Швидкість ─── -->
    <Card size="sm" class="mt-3 rounded-2xl">
      <CardContent>
        <h2 class="text-sm font-semibold text-foreground">
          Зазвичай ви відгукуєтесь за {duration(p.medianResponseMinutes)}
        </h2>
        <p class="mt-1 text-xs leading-snug text-muted-foreground">
          Час від появи заявки до вашого відгуку. Хто відповідає швидше — того
          система показує клієнтам вище.
        </p>
      </CardContent>
    </Card>
  {/if}
</div>
