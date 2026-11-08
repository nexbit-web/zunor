<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import PageHead from '$lib/components/dashboard/page-head.svelte'
  import JobCard from './job-card.svelte'
  import JobState from './job-state.svelte'
  import { jobState } from './display'
  import JobCardSkeleton from './job-card-skeleton.svelte'
  import Plus from '$lib/components/icons/set/plus.svelte'
  import Briefcase from '$lib/components/icons/set/briefcase.svelte'
  import ChevronDown from '$lib/components/icons/set/chevron-down.svelte'
  import Check from '$lib/components/icons/set/check.svelte'
  import { onMount, untrack } from 'svelte'

  let {
    initialJobs,
    initialNextCursor,
    counts,
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
    filters?: unknown
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
  const STATUS_OPTIONS = $derived([
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
    {
      value: 'OTHER' as const,
      label: 'Скасовані й прострочені',
      count: counts.other,
    },
  ])

  const activeLabel = $derived(
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? 'Усі',
  )

  /** Живі заявки — те, що ще чекає на клієнта чи майстра. */
  const activeCount = $derived(counts.open + counts.inProgress)

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

<PageHead>
  <div class="flex items-center justify-between gap-3">
    <div class="flex min-w-0 items-center gap-2.5">
      <h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
        Мої заявки
      </h1>
      {#if activeCount > 0}
        <span
          class="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary"
          title="Активні заявки"
        >
          {activeCount}
        </span>
      {/if}
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <!-- Фільтр — як у «Замовленнях» і «Сповіщеннях»: приглушена кнопка
           «Показати: …». Пʼять вкладок із лічильниками займали цілий
           рядок і на телефоні переносились у два, хоча обрана завжди одна. -->
      {#if counts.all > 0}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="secondary"
                size="sm"
                class="font-normal text-muted-foreground"
              >
                <span class="hidden sm:inline">Показати:</span>
                <span class="font-medium text-foreground">{activeLabel}</span>
                <ChevronDown class="size-3.5 opacity-60" />
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>

          <!-- Вигляд меню й пунктів — зі спільного ui/dropdown-menu (як у
               референсі в docs/); тут лише ширина. -->
          <DropdownMenu.Content align="end" class="w-auto min-w-56">
            {#each STATUS_OPTIONS as option (option.value)}
              <DropdownMenu.Item
                class="cursor-pointer"
                onclick={() => (statusFilter = option.value)}
              >
                <span class="min-w-0 flex-1 truncate">{option.label}</span>
                <span class="text-xs tabular-nums text-muted-foreground">
                  {option.count}
                </span>
                <!-- Місце під галочку є завжди: інакше лічильник обраного
                     пункту стрибав би ліворуч. -->
                <Check
                  class="size-4 shrink-0 text-primary {statusFilter !==
                  option.value
                    ? 'invisible'
                    : ''}"
                />
              </DropdownMenu.Item>
              {#if option.value === 'all'}
                <DropdownMenu.Separator />
              {/if}
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}

      <Button size="sm" href="/dashboard/jobs/new">
        <Plus />
        <span class="hidden sm:inline">Нова заявка</span>
      </Button>
    </div>
  </div>
</PageHead>

{#if filtered.length === 0}
  <!-- flex-1: порожній стан займає всю висоту, що лишилась під шапкою,
       і знак стоїть по центру сторінки. -->
  <div
    class="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center"
  >
    <Briefcase class="size-14 text-muted-foreground/70" strokeWidth={1} />
    <h2 class="mt-6 text-lg font-medium">
      {counts.all === 0 ? 'Заявок поки немає' : 'Нічого не знайдено'}
    </h2>
    <p class="mt-2 max-w-90 text-sm leading-relaxed text-muted-foreground">
      {counts.all === 0
        ? 'Опишіть, що прибрати, — майстри поруч самі запропонують ціну.'
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
  <ul class="mt-2 flex flex-col gap-3">
    {#each filtered as job (job.id)}
      {@const state = jobState(job)}
      <JobCard
        href={`/dashboard/jobs/${job.id}`}
        title={job.title}
        description={job.description}
        metadata={job.metadata}
        createdAt={job.createdAt}
        budgetMinCents={job.budgetMinCents}
        budgetMaxCents={job.budgetMaxCents}
        currency={job.currency}
        dimmed={state.tone === 'off'}
      >
        {#snippet aside()}
          <JobState status={job.status} proposalsCount={job.proposalsCount} />
        {/snippet}
      </JobCard>
    {/each}
  </ul>

  <div bind:this={sentinelEl} class="h-1"></div>

  {#if loadingMore}
    <JobCardSkeleton count={2} />
  {/if}
  {#if !nextCursor && jobs.length > 0 && !loadingMore}
    <p class="py-8 text-center text-xs text-muted-foreground">Кінець списку</p>
  {/if}
{/if}
