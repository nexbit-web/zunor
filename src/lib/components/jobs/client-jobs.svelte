<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { Card, CardContent, CardFooter } from '$lib/components/ui/card'
  import * as Tabs from '$lib/components/ui/tabs'
  import JobCardSkeleton from './job-card-skeleton.svelte'
  import {
    Plus,
    Briefcase,
    Eye,
    MessageSquare,
    ChevronRight,
  } from 'lucide-svelte'
  import { onMount, untrack } from 'svelte'
  import { describeJob } from '$lib/categories/cleaning/describe'
  import { detailIcon } from '$lib/categories/cleaning/detail-icons'
  function jobDetails(job: any) {
    return describeJob(job.metadata).filter(
      (d) => d.label !== 'Послуга' && !d.items,
    )
  }

  let {
    initialJobs,
    initialNextCursor,
    counts,
    filters,
  }: {
    initialJobs: any[]
    initialNextCursor: string | null
    counts: {
      all: number
      open: number
      inProgress: number
      completed: number
      other: number
    }
    filters: {
      categories: { slug: string; name: string }[]
      cities: {
        slug: string
        name: string
        region?: string | null
        isCapital?: boolean
      }[]
    }
  } = $props()

  // untrack: перша сторінка з SSR — це ПОЧАТКОВИЙ знімок. Далі список
  // росте догрузкою через /api/jobs/feed, і перезапис пропом стер би її.
  let jobs = $state(untrack(() => [...initialJobs]))
  let nextCursor = $state<string | null>(untrack(() => initialNextCursor))
  let loadingMore = $state(false)
  let sentinelEl = $state<HTMLDivElement | null>(null)

  type StatusFilter = 'all' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'OTHER'
  let statusFilter = $state<StatusFilter>('all')

  const filtered = $derived.by(() => {
    if (statusFilter === 'all') return jobs
    if (statusFilter === 'OTHER')
      return jobs.filter((j) => ['CANCELLED', 'EXPIRED'].includes(j.status))
    return jobs.filter((j) => j.status === statusFilter)
  })

  // $derived, а не const: лічильники приходять пропом і змінюються.
  const STATUS_TABS = $derived([
    { value: 'all' as const, label: 'Усі', count: counts.all },
    { value: 'OPEN' as const, label: 'Відкриті', count: counts.open },
    {
      value: 'IN_PROGRESS' as const,
      label: 'У роботі',
      count: counts.inProgress,
    },
    {
      value: 'COMPLETED' as const,
      label: 'Завершені',
      count: counts.completed,
    },
    { value: 'OTHER' as const, label: 'Інше', count: counts.other },
  ])

  // categoryLabel / cityLabel / formatMoney / formatBudget звідси прибрані:
  // жодну з них розмітка не викликала. Бюджет на картці заявки клієнта не
  // показуємо взагалі — ціну визначає відгук майстра, а не заявка.

  function formatRelative(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const min = Math.floor(diff / 60_000)
    const hr = Math.floor(min / 60)
    const days = Math.floor(hr / 24)
    if (min < 1) return 'щойно'
    if (min < 60) return `${min} хв тому`
    if (hr < 24) return `${hr} год тому`
    if (days < 7) return `${days} дн`
    return new Date(iso).toLocaleDateString('uk-UA', {
      day: 'numeric',
      month: 'short',
    })
  }
  function expiresIn(iso: string) {
    const diff = new Date(iso).getTime() - Date.now()
    if (diff <= 0) return 'Прострочено'
    const days = Math.floor(diff / (24 * 60 * 60_000))
    const hr = Math.floor(diff / (60 * 60_000))
    if (days >= 1) return `${days} дн`
    if (hr >= 1) return `${hr} год`
    return '< 1 год'
  }
  function statusVariant(
    s: string,
  ): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (s === 'OPEN') return 'default'
    if (s === 'IN_PROGRESS') return 'secondary'
    return 'outline'
  }
  function statusLabel(s: string) {
    return (
      (
        {
          OPEN: 'Відкрита',
          IN_PROGRESS: 'У роботі',
          COMPLETED: 'Завершена',
          CANCELLED: 'Скасована',
          EXPIRED: 'Прострочена',
        } as Record<string, string>
      )[s] ?? s
    )
  }

  async function loadMore() {
    if (loadingMore || !nextCursor) return
    loadingMore = true
    try {
      const p = new URLSearchParams({ view: 'mine', cursor: nextCursor })
      const res = await fetch(`/api/jobs/feed?${p}`)
      if (!res.ok) return
      const json = await res.json()
      jobs = [...jobs, ...json.jobs]
      nextCursor = json.nextCursor
    } catch (e) {
      console.error('[client-jobs:loadMore]', e)
    } finally {
      loadingMore = false
    }
  }

  onMount(() => {
    if (!sentinelEl) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor && !loadingMore) loadMore()
      },
      { rootMargin: '300px' },
    )
    obs.observe(sentinelEl)
    return () => obs.disconnect()
  })
</script>

<!-- Header -->
<header class="mb-6 flex items-center justify-between gap-3 sm:mb-8">
  <div class="flex min-w-0 items-center gap-2.5">
    <h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
      Мої заявки
    </h1>
    {#if counts.open > 0}
      <span
        class="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary"
      >
        {counts.open}
      </span>
    {/if}
  </div>

  <Button size="sm" href="/dashboard/jobs/new" class="shrink-0">
    <Plus />
    <span class="hidden sm:inline">Нова заявка</span>
  </Button>
</header>

<!-- Status tabs -->
{#if counts.all > 0}
  <!--
    Tabs із ui замість власних кнопок: підкреслення активної вкладки
    давав рукописний `.status-tab::after`, і точно такий самий блок стилів
    лежав ще й на сторінці замовлень — два описи однієї вкладки.

    flex-wrap замість overflow-x-auto: горизонтальний скрол ховав останні
    вкладки за краєм екрана без жодного натяку, що вони є. h-auto —
    бо стандартна висота List розрахована на один рядок.
  -->
  <Tabs.Root
    value={statusFilter}
    onValueChange={(v) => (statusFilter = v as StatusFilter)}
    class="mb-6"
  >
    <Tabs.List variant="line" class="h-auto w-full flex-wrap justify-start">
      {#each STATUS_TABS as tab (tab.value)}
        <Tabs.Trigger value={tab.value} class="flex-none gap-2 px-3 py-2">
          {tab.label}
          {#if tab.count > 0}
            <Badge variant="secondary" class="tabular-nums">{tab.count}</Badge>
          {/if}
        </Tabs.Trigger>
      {/each}
    </Tabs.List>
  </Tabs.Root>
{/if}

<!-- List -->
{#if filtered.length === 0}
  <!-- flex-1: порожній стан займає всю висоту, що лишилась під шапкою,
       і знак стоїть по центру сторінки. Підкладки під іконкою немає —
       вона й була тим блоком, через який стан виглядав як картка. -->
  <div
    class="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center"
  >
    <Briefcase class="size-14 text-muted-foreground/70" strokeWidth={1} />
    <h2 class="mt-6 text-lg font-medium">
      {counts.all === 0 ? 'Заявок поки немає' : 'Нічого не знайдено'}
    </h2>
    <p class="mt-2 max-w-90 text-sm leading-relaxed text-muted-foreground">
      {counts.all === 0
        ? 'Створіть першу заявку — і майстри почнуть надсилати пропозиції.'
        : 'Спробуйте інший фільтр.'}
    </p>
    {#if counts.all === 0}
      <Button href="/dashboard/jobs/new" class="mt-6">
        <Plus />
        Створити заявку
      </Button>
    {:else}
      <Button
        variant="secondary"
        size="sm"
        class="mt-6"
        onclick={() => (statusFilter = 'all')}
      >
        Показати всі
      </Button>
    {/if}
  </div>
{:else}
  <div class="space-y-3">
    {#each filtered as job (job.id)}
      <a href={`/dashboard/jobs/${job.id}`} class="group block">
        <Card
          size="sm"
          class="gap-3 rounded-3xl transition-transform group-hover:-translate-y-0.5"
        >
          <CardContent class="space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <Badge
                  variant={statusVariant(job.status)}
                  class="text-[10px] font-bold uppercase"
                >
                  {statusLabel(job.status)}
                </Badge>
                <span class="text-xs text-muted-foreground">
                  {formatRelative(job.createdAt)}
                </span>
                {#if job.status === 'OPEN'}
                  <span class="text-xs text-muted-foreground">
                    · Активна ще {expiresIn(job.expiresAt)}
                  </span>
                {/if}
              </div>
              <ChevronRight
                class="size-5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              />
            </div>

            <h3
              class="text-base leading-snug font-semibold text-foreground sm:text-lg"
            >
              {job.title}
            </h3>

            {#if job.description}
              <p
                class="line-clamp-2 text-sm leading-relaxed text-muted-foreground"
              >
                {job.description}
              </p>
            {/if}

            {#if jobDetails(job).length > 0}
              <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
                {#each jobDetails(job) as d (d.label)}
                  {@const Icon = detailIcon(d.icon)}
                  <!-- Чипи — Badge з ui. Раніше тут був `var(--brand)`:
                       токен видалили з теми, і чип «Коли» малювався
                       прозорим по прозорому — дати не було видно взагалі. -->
                  {#if d.label === 'Коли'}
                    <Badge
                      class="h-7 gap-1.5 bg-primary/12 px-2.5 font-semibold text-primary"
                    >
                      {#if Icon}<Icon />{/if}
                      {d.value}
                    </Badge>
                  {:else}
                    <Badge variant="secondary" class="h-7 gap-1.5 px-2.5">
                      {#if Icon}<Icon class="opacity-60" />{/if}
                      {d.value}
                    </Badge>
                  {/if}
                {/each}
              </div>
            {/if}
          </CardContent>

          <CardFooter class="gap-3 border-t pt-4 text-xs text-muted-foreground">
            <span class="inline-flex items-center gap-1">
              <MessageSquare class="size-3.5" />
              {job.proposalsCount} пропозиц{job.proposalsCount === 1
                ? 'ія'
                : 'ій'}
            </span>
            <span class="inline-flex items-center gap-1">
              <Eye class="size-3.5" />
              {job.viewsCount}
            </span>
          </CardFooter>
        </Card>
      </a>
    {/each}
  </div>

  <div bind:this={sentinelEl} class="h-1"></div>

  {#if loadingMore}
    <div class="mt-3 space-y-3">
      <JobCardSkeleton count={2} />
    </div>
  {/if}
  {#if !nextCursor && jobs.length > 0 && !loadingMore}
    <p class="py-8 text-center text-xs text-muted-foreground">Кінець списку</p>
  {/if}
{/if}
