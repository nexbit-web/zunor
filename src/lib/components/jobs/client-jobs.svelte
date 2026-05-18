<!-- src/lib/components/jobs/client-jobs.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { Spinner } from '$lib/components/ui/spinner'
  import {
    Plus,
    Briefcase,
    MapPin,
    Layers,
    Eye,
    MessageSquare,
    ChevronRight,
  } from 'lucide-svelte'
  import { onMount } from 'svelte'

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

  let jobs = $state([...initialJobs])
  let nextCursor = $state<string | null>(initialNextCursor)
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

  function categoryLabel(slug: string) {
    return filters.categories.find((c) => c.slug === slug)?.name ?? slug
  }
  function cityLabel(slug: string) {
    return filters.cities.find((c) => c.slug === slug)?.name ?? slug
  }

  function formatMoney(cents: number) {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency: 'UAH',
      minimumFractionDigits: 0,
    }).format(cents / 100)
  }
  function formatBudget(min: number | null, max: number | null) {
    if (min && max) return `${formatMoney(min)} — ${formatMoney(max)}`
    if (max) return `до ${formatMoney(max)}`
    if (min) return `від ${formatMoney(min)}`
    return 'Договірний'
  }
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
<header class="mb-6">
  <div class="flex items-start justify-between gap-4 flex-wrap">
    <div>
      <h1
        class="text-2xl sm:text-3xl font-bold tracking-tight"
        style="color: var(--foreground); letter-spacing: -0.02em"
      >
        Мої заявки
      </h1>
      <p class="text-sm mt-1.5" style="color: var(--muted-foreground)">
        Ваші заявки на пошук майстра
      </p>
    </div>
    <Button
      onclick={() => goto('/jobs/new')}
      class="rounded-full gap-2 shrink-0"
    >
      <Plus class="size-4" strokeWidth={2.25} />
      Нова заявка
    </Button>
  </div>
</header>

<!-- Status tabs -->
{#if counts.all > 0}
  <div
    class="flex items-center gap-0 border-b mb-6 overflow-x-auto"
    style="border-color: var(--border)"
  >
    {#each [{ value: 'all' as const, label: 'Усі', count: counts.all }, { value: 'OPEN' as const, label: 'Відкриті', count: counts.open }, { value: 'IN_PROGRESS' as const, label: 'У роботі', count: counts.inProgress }, { value: 'COMPLETED' as const, label: 'Завершені', count: counts.completed }, { value: 'OTHER' as const, label: 'Інше', count: counts.other }] as tab (tab.value)}
      {@const isActive = statusFilter === tab.value}
      <button
        type="button"
        onclick={() => (statusFilter = tab.value)}
        class="status-tab inline-flex items-center gap-2 px-4 py-3 text-sm font-medium cursor-pointer whitespace-nowrap relative"
        class:active={isActive}
      >
        {tab.label}
        {#if tab.count > 0}
          <span
            class="text-[11px] tabular-nums px-1.5 py-0.5 rounded font-semibold"
            style="background-color: {isActive
              ? 'color-mix(in oklch, var(--foreground) 8%, transparent)'
              : 'var(--muted)'};
                   color: {isActive
              ? 'var(--foreground)'
              : 'var(--muted-foreground)'}">{tab.count}</span
          >
        {/if}
      </button>
    {/each}
  </div>
{/if}

<!-- List -->
{#if filtered.length === 0}
  <div
    class="rounded-2xl px-6 py-16 text-center"
    style="background-color: var(--card); border: 1px solid var(--border)"
  >
    <div
      class="size-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
      style="background-color: var(--muted)"
    >
      <Briefcase
        class="size-6"
        style="color: var(--muted-foreground)"
        strokeWidth={1.75}
      />
    </div>
    <h2 class="text-base font-semibold mb-1" style="color: var(--foreground)">
      {counts.all === 0 ? 'Ще немає заявок' : 'Нічого не знайдено'}
    </h2>
    <p class="text-sm max-w-sm mx-auto" style="color: var(--muted-foreground)">
      {counts.all === 0
        ? 'Створіть першу заявку — і майстри почнуть надсилати пропозиції'
        : 'Спробуйте інший фільтр'}
    </p>
    {#if counts.all === 0}
      <Button onclick={() => goto('/jobs/new')} class="mt-5 rounded-full gap-2">
        <Plus class="size-4" />
        Створити заявку
      </Button>
    {/if}
  </div>
{:else}
  <div class="space-y-3">
    {#each filtered as job (job.id)}
      <a
        href={`/jobs/${job.id}`}
        class="block rounded-2xl p-5 transition-all hover:-translate-y-0.5 group"
        style="background-color: var(--card); border: 1px solid var(--border)"
      >
        <div class="flex items-center justify-between gap-2 mb-2.5">
          <div class="flex items-center gap-2 flex-wrap min-w-0">
            <Badge
              variant={statusVariant(job.status)}
              class="text-[10px] uppercase font-bold"
            >
              {statusLabel(job.status)}
            </Badge>
            <span class="text-xs" style="color: var(--muted-foreground)"
              >{formatRelative(job.createdAt)}</span
            >
            {#if job.status === 'OPEN'}
              <span class="text-xs" style="color: var(--muted-foreground)"
                >· Активна ще {expiresIn(job.expiresAt)}</span
              >
            {/if}
          </div>
          <ChevronRight
            class="size-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            style="color: var(--muted-foreground)"
          />
        </div>

        <h3
          class="text-base sm:text-lg font-semibold leading-snug mb-2"
          style="color: var(--foreground)"
        >
          {job.title}
        </h3>
        <p
          class="text-sm leading-relaxed line-clamp-2 mb-3"
          style="color: var(--muted-foreground)"
        >
          {job.description}
        </p>

        <div class="flex items-center gap-2 flex-wrap mb-3">
          <Badge variant="outline" class="font-normal gap-1 text-xs">
            <Layers class="size-3" />
            {categoryLabel(job.category)}
          </Badge>
          <Badge variant="outline" class="font-normal gap-1 text-xs">
            <MapPin class="size-3" />
            {cityLabel(job.city)}
          </Badge>
          <Badge variant="secondary" class="font-semibold tabular-nums text-xs">
            {formatBudget(job.budgetMinCents, job.budgetMaxCents)}
          </Badge>
        </div>

        <div
          class="flex items-center gap-3 pt-3 text-xs"
          style="border-top: 1px solid var(--border); color: var(--muted-foreground)"
        >
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
        </div>
      </a>
    {/each}
  </div>

  <div bind:this={sentinelEl} class="h-1"></div>

  {#if loadingMore}
    <div class="flex justify-center py-8"><Spinner /></div>
  {/if}
  {#if !nextCursor && jobs.length > 0 && !loadingMore}
    <div class="text-center py-8">
      <p class="text-xs" style="color: var(--muted-foreground)">
        Кінець списку
      </p>
    </div>
  {/if}
{/if}

<style>
  .status-tab {
    color: color-mix(in oklch, var(--foreground) 60%, transparent);
  }
  .status-tab:hover {
    color: var(--foreground);
  }
  .status-tab.active {
    color: var(--foreground);
  }
  .status-tab.active::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    background-color: var(--foreground);
    border-radius: 2px;
  }
</style>
