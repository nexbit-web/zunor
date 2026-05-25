<!-- src/lib/components/jobs/master-feed.svelte -->
<script lang="ts">
  import { Spinner } from '$lib/components/ui/spinner'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { onMount } from 'svelte'
  import { fly } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import {
    Briefcase,
    Star,
    ChevronRight,
    AlertCircle,
    Clock,
    MapPin,
  } from 'lucide-svelte'

  import * as Icons from '@lucide/svelte'

  function iconByName(name: string | undefined): any {
    if (!name) return null
    return (Icons as Record<string, unknown>)[name] ?? null
  }

  import { goto } from '$app/navigation'
  import { SERVICES } from '$lib/categories/cleaning/presets'
  import { describeJob } from '$lib/categories/cleaning/describe'

  let {
    initialJobs,
    initialNextCursor,
    blockReason,
  }: {
    initialJobs: any[]
    initialNextCursor: string | null
    blockReason: string | null
    filters?: any
  } = $props()

  let jobs = $state([...initialJobs])
  let nextCursor = $state<string | null>(initialNextCursor)
  let loadingMore = $state(false)
  let sentinelEl = $state<HTMLDivElement | null>(null)

  // Фільтр по типу послуги
  let activeService = $state<string>('')

  function buildQuery(cursor: string | null) {
    const p = new URLSearchParams({ view: 'feed' })
    if (cursor) p.set('cursor', cursor)
    return p.toString()
  }

  async function reload() {
    loadingMore = true
    try {
      const res = await fetch(`/api/jobs/feed?${buildQuery(null)}`)
      if (!res.ok) return
      const json = await res.json()
      jobs = json.jobs
      nextCursor = json.nextCursor
    } catch (e) {
      console.error('[master-feed:reload]', e)
    } finally {
      loadingMore = false
    }
  }

  async function loadMore() {
    if (loadingMore || !nextCursor) return
    loadingMore = true
    try {
      const res = await fetch(`/api/jobs/feed?${buildQuery(nextCursor)}`)
      if (!res.ok) return
      const json = await res.json()
      jobs = [...jobs, ...json.jobs]
      nextCursor = json.nextCursor
    } catch (e) {
      console.error('[master-feed:loadMore]', e)
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
      { rootMargin: '400px' },
    )
    obs.observe(sentinelEl)
    return () => obs.disconnect()
  })

  // Клієнтська фільтрація по типу послуги (metadata.service)
  const visibleJobs = $derived(
    activeService
      ? jobs.filter((j) => {
          const meta = j.metadata as Record<string, unknown> | null
          return meta?.service === activeService
        })
      : jobs,
  )

  // Helpers
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
  function jobDetails(job: any) {
    // Беремо ключові деталі (без "Послуга" — вона вже в заголовку, і без предметів)
    return describeJob(job.metadata).filter(
      (d) => d.label !== 'Послуга' && !d.items,
    )
  }
  function initials(name: string | null | undefined) {
    return (name ?? '?')[0]?.toUpperCase() ?? '?'
  }
</script>

<!-- Header -->
<header class="mb-6">
  <h1
    class="text-2xl sm:text-3xl font-bold tracking-tight"
    style="color: var(--foreground); letter-spacing: -0.02em"
  >
    Заявки поруч
  </h1>
  <p class="text-sm mt-1.5" style="color: var(--muted-foreground)">
    Нові замовлення на прибирання у вашому місті
  </p>
</header>

{#if blockReason}
  <div
    class="mb-6 p-4 rounded-2xl flex items-start gap-3"
    style="background-color: color-mix(in oklch, #f59e0b 8%, transparent); border: 1px solid color-mix(in oklch, #f59e0b 25%, transparent)"
  >
    <AlertCircle class="size-5 shrink-0 mt-0.5" style="color: #b45309" />
    <div>
      <p class="text-sm font-semibold" style="color: #b45309">{blockReason}</p>
      <p class="text-sm mt-1" style="color: var(--muted-foreground)">
        Заповніть профіль майстра щоб бачити доступні заявки.
      </p>
      <button
        type="button"
        onclick={() => goto('/settings')}
        class="text-sm font-medium mt-2 cursor-pointer hover:underline"
        style="color: var(--primary)"
      >
        Перейти до налаштувань →
      </button>
    </div>
  </div>
{:else}
  <!-- Фільтр по типу послуги -->
  <div
    class="filter-row mb-6 flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible"
  >
    <button
      type="button"
      onclick={() => (activeService = '')}
      class="shrink-0 px-4 h-9 rounded-full text-sm font-medium cursor-pointer transition-all whitespace-nowrap
        {activeService === ''
        ? 'bg-foreground text-background'
        : 'bg-secondary text-foreground hover:opacity-80'}"
    >
      Усі
    </button>
    {#each SERVICES as s (s.key)}
      <button
        type="button"
        onclick={() => (activeService = s.key)}
        class="shrink-0 px-4 h-9 rounded-full text-sm font-medium cursor-pointer transition-all whitespace-nowrap
          {activeService === s.key
          ? 'bg-foreground text-background'
          : 'bg-secondary text-foreground hover:opacity-80'}"
      >
        {s.label}
      </button>
    {/each}
  </div>
{/if}

<!-- List -->
{#if visibleJobs.length === 0 && !loadingMore}
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
      {activeService ? 'Немає заявок цього типу' : 'Поки немає заявок'}
    </h2>
    <p class="text-sm" style="color: var(--muted-foreground)">
      {activeService
        ? 'Спробуйте інший фільтр'
        : 'Зайдіть пізніше — нові заявки з’являються щодня'}
    </p>
  </div>
{:else}
  <div class="space-y-3">
    {#each visibleJobs as job, i (job.id)}
      <a
        href={`/jobs/${job.id}`}
        in:fly={{
          y: 12,
          duration: 260,
          delay: Math.min(i, 6) * 40,
          easing: quintOut,
        }}
        class="block rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-md group"
        style="background-color: var(--card); border: 1px solid var(--border)"
      >
        <!-- Час -->
        <div class="flex items-center justify-between gap-2 mb-2.5">
          <span
            class="text-xs inline-flex items-center gap-1"
            style="color: var(--muted-foreground)"
          >
            <Clock class="size-3" />
            {formatRelative(job.createdAt)}
          </span>
          <ChevronRight
            class="size-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            style="color: var(--muted-foreground)"
          />
        </div>

        <!-- Заголовок (тип прибирання) -->
        <h3
          class="text-base sm:text-lg font-semibold leading-snug mb-3"
          style="color: var(--foreground)"
        >
          {job.title}
        </h3>

        <!-- Ключові деталі (чипи) -->
        {#if jobDetails(job).length > 0}
          <div class="flex items-center gap-1.5 flex-wrap mb-3">
            {#each jobDetails(job) as d (d.label)}
              {@const Icon = iconByName(d.icon)}
              {#if d.label === 'Коли'}
                <!-- Дата — акцентний чип (важливо майстру) -->
                <span
                  class="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-semibold"
                  style="background-color: color-mix(in srgb, var(--brand) 12%, transparent); color: var(--brand)"
                >
                  {#if Icon}<Icon class="size-3.5" />{/if}
                  {d.value}
                </span>
              {:else}
                <span
                  class="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-medium"
                  style="background-color: var(--secondary); color: var(--foreground)"
                >
                  {#if Icon}<Icon class="size-3.5 opacity-60" />{/if}
                  {d.value}
                </span>
              {/if}
            {/each}
          </div>
        {/if}

        <!-- Клієнт -->
        {#if job.client}
          <div
            class="flex items-center gap-2 pt-3"
            style="border-top: 1px solid var(--border)"
          >
            <Avatar class="size-8 shrink-0">
              <AvatarImage
                src={job.client.avatar ?? ''}
                alt={job.client.name ?? ''}
              />
              <AvatarFallback class="text-xs font-semibold"
                >{initials(job.client.name)}</AvatarFallback
              >
            </Avatar>
            <div class="min-w-0 flex-1">
              <p
                class="text-sm font-medium truncate"
                style="color: var(--foreground)"
              >
                {job.client.name ?? 'Замовник'}
              </p>
            </div>
            {#if job.client.reviewsCount > 0}
              <span
                class="text-[11px] inline-flex items-center gap-1 shrink-0"
                style="color: var(--muted-foreground)"
              >
                <Star class="size-3" style="color: #f5a623; fill: #f5a623" />
                {job.client.avgRating.toFixed(1)} ({job.client.reviewsCount})
              </span>
            {/if}
          </div>
        {/if}
      </a>
    {/each}
  </div>

  <div bind:this={sentinelEl} class="h-1"></div>
  {#if loadingMore}
    <div class="flex justify-center py-8"><Spinner /></div>
  {/if}
  {#if !nextCursor && visibleJobs.length > 0 && !loadingMore}
    <div class="text-center py-8">
      <p class="text-xs" style="color: var(--muted-foreground)">
        Це всі заявки
      </p>
    </div>
  {/if}
{/if}

<style>
  .filter-row {
    scrollbar-width: none; /* Firefox */
  }
  .filter-row::-webkit-scrollbar {
    display: none; /* Chrome/Safari */
  }
</style>
