<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import PageHead from '$lib/components/dashboard/page-head.svelte'
  import JobRow from './job-row.svelte'
  import JobCardSkeleton from './job-card-skeleton.svelte'
  import { Plus, Briefcase, ChevronDown, Check, Calendar } from 'lucide-svelte'
  import { onMount, untrack } from 'svelte'
  import { formatDay } from '$lib/utils/time'
  import { pluralUk } from '$lib/utils/plural'
  import { resolveWhen } from '$lib/categories/cleaning/presets'

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

  /**
   * Стан словами клієнта, а не статусом із бази. «Відкрита» нічого не
   * каже людині: їй важливо, чи шукають ще майстра, чи вже є з кого
   * обирати. Тому відкрита заявка з пропозиціями — окремий стан, і саме
   * він єдиний залитий кольором: це місце, де клієнт має щось зробити.
   */
  type Tone = 'action' | 'live' | 'progress' | 'done' | 'off'

  function stateOf(job: any): { label: string; tone: Tone } {
    switch (job.status) {
      case 'OPEN': {
        const n = job.proposalsCount ?? 0
        return n > 0
          ? {
              label: `${n} ${pluralUk(n, 'пропозиція', 'пропозиції', 'пропозицій')}`,
              tone: 'action',
            }
          : { label: 'Шукаємо майстра', tone: 'live' }
      }
      case 'IN_PROGRESS':
        return { label: 'Майстра обрано', tone: 'progress' }
      case 'COMPLETED':
        return { label: 'Завершена', tone: 'done' }
      case 'EXPIRED':
        return { label: 'Термін минув', tone: 'off' }
      default:
        return { label: 'Скасована', tone: 'off' }
    }
  }

  const TONE: Record<Tone, string> = {
    action: 'bg-primary text-primary-foreground',
    live: 'bg-primary/10 text-primary',
    progress: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
    done: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
    off: 'bg-muted text-muted-foreground',
  }

  /** День прибирання з урахуванням «today/tomorrow» від дня створення. */
  function dayOf(job: any): string {
    const iso = resolveWhen(job.metadata?.when, job.createdAt)
    return iso ? formatDay(iso) : ''
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

          <DropdownMenu.Content align="end" class="w-60 rounded-2xl p-1.5">
            {#each STATUS_OPTIONS as option (option.value)}
              <DropdownMenu.Item
                class="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm outline-none data-highlighted:bg-accent"
                onclick={() => (statusFilter = option.value)}
              >
                <span class="flex min-w-0 items-center gap-2">
                  <span class="truncate">{option.label}</span>
                  <span class="text-xs tabular-nums text-muted-foreground">
                    {option.count}
                  </span>
                </span>
                {#if statusFilter === option.value}
                  <Check class="size-4 shrink-0 text-ring" />
                {/if}
              </DropdownMenu.Item>
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
  <ul class="mt-1 border-t border-border/60">
    {#each filtered as job (job.id)}
      {@const state = stateOf(job)}
      {@const day = dayOf(job)}
      <JobRow
        href={`/dashboard/jobs/${job.id}`}
        service={job.metadata?.service}
        title={job.title}
        description={job.description}
        dimmed={state.tone === 'off'}
      >
        {#snippet status()}
          <span
            class={[
              'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium whitespace-nowrap',
              TONE[state.tone],
            ]}
          >
            {#if state.tone === 'live'}
              <!-- Пульс — «пошук іде просто зараз». Рівно один на рядок:
                   якби дихало все, не казало б нічого. -->
              <span class="live-dot size-1.5 rounded-full bg-primary"></span>
            {/if}
            {state.label}
          </span>
        {/snippet}
        {#snippet meta()}
          {#if day}
            <span class="inline-flex items-center gap-1.5">
              <Calendar class="size-3.5" aria-hidden="true" />
              <span class="text-foreground/80">{day}</span>
            </span>
          {/if}
        {/snippet}
      </JobRow>
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

<style>
  .live-dot {
    animation: live-pulse 2s ease-in-out infinite;
  }
  @keyframes live-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .live-dot {
      animation: none;
    }
  }
</style>
