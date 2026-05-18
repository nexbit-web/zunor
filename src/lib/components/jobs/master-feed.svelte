<!-- src/lib/components/jobs/master-feed.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { Input } from '$lib/components/ui/input'
  import { Spinner } from '$lib/components/ui/spinner'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import * as Popover from '$lib/components/ui/popover'
  import * as Command from '$lib/components/ui/command'
  import { cn } from '$lib/utils'
  import { onMount } from 'svelte'
  import {
    Briefcase,
    MapPin,
    Layers,
    Star,
    ChevronRight,
    SlidersHorizontal,
    ChevronsUpDown,
    X,
    AlertCircle,
  } from 'lucide-svelte'

  let {
    initialJobs,
    initialNextCursor,
    blockReason,
    filters,
  }: {
    initialJobs: any[]
    initialNextCursor: string | null
    blockReason: string | null
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

  // Filters
  let filterCategories = $state<string[]>([])
  let filterCities = $state<string[]>([])
  let filterMinPrice = $state('')
  let filterMaxPrice = $state('')
  let priceOpen = $state(false)
  let categoryPickerOpen = $state(false)
  let cityPickerOpen = $state(false)

  const activeFiltersCount = $derived(
    (filterCategories.length > 0 ? 1 : 0) +
      (filterCities.length > 0 ? 1 : 0) +
      (filterMinPrice ? 1 : 0) +
      (filterMaxPrice ? 1 : 0),
  )

  function toggleCategory(slug: string) {
    filterCategories = filterCategories.includes(slug)
      ? filterCategories.filter((s) => s !== slug)
      : [...filterCategories, slug]
  }
  function toggleCity(slug: string) {
    filterCities = filterCities.includes(slug)
      ? filterCities.filter((s) => s !== slug)
      : [...filterCities, slug]
  }
  function clearFilters() {
    filterCategories = []
    filterCities = []
    filterMinPrice = ''
    filterMaxPrice = ''
  }

  function buildQuery(cursor: string | null) {
    const p = new URLSearchParams({ view: 'feed' })
    if (cursor) p.set('cursor', cursor)
    if (filterCategories.length) p.set('categories', filterCategories.join(','))
    if (filterCities.length) p.set('cities', filterCities.join(','))
    if (filterMinPrice) p.set('minPrice', filterMinPrice)
    if (filterMaxPrice) p.set('maxPrice', filterMaxPrice)
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
      { rootMargin: '300px' },
    )
    obs.observe(sentinelEl)
    return () => obs.disconnect()
  })

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  $effect(() => {
    void filterCategories
    void filterCities
    void filterMinPrice
    void filterMaxPrice
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(reload, 250)
  })

  // Helpers
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
  function categoryLabel(slug: string) {
    return filters.categories.find((c) => c.slug === slug)?.name ?? slug
  }
  function cityLabel(slug: string) {
    return filters.cities.find((c) => c.slug === slug)?.name ?? slug
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
    Знайти роботу
  </h1>
  <p class="text-sm mt-1.5" style="color: var(--muted-foreground)">
    Заявки клієнтів, які підходять вашому профілю
  </p>
</header>

<!-- Block reason -->
{#if blockReason}
  <div
    class="mb-6 p-4 rounded-2xl flex items-start gap-3"
    style="background-color: color-mix(in oklch, #f59e0b 8%, transparent);
              border: 1px solid color-mix(in oklch, #f59e0b 25%, transparent)"
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
  <!-- Filters -->
  <div class="mb-6 space-y-3">
    <div class="flex items-center gap-2 flex-wrap">
      <!-- Price toggle -->
      <Button
        variant="outline"
        size="sm"
        class={cn('gap-2 rounded-full', priceOpen && 'border-foreground')}
        onclick={() => (priceOpen = !priceOpen)}
      >
        <SlidersHorizontal class="size-3.5" />
        Ціна
        {#if filterMinPrice || filterMaxPrice}
          <Badge variant="secondary" class="px-1.5 py-0 ml-1">1</Badge>
        {/if}
      </Button>

      <!-- Categories -->
      <Popover.Root bind:open={categoryPickerOpen}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="outline"
              size="sm"
              class={cn(
                'gap-1.5 rounded-full font-normal',
                filterCategories.length > 0 && 'border-foreground',
              )}
            >
              <Layers class="size-3.5 opacity-60" />
              {filterCategories.length > 0
                ? `Категорії: ${filterCategories.length}`
                : 'Категорія'}
              <ChevronsUpDown class="size-3 opacity-40" />
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-72 p-0" align="start" sideOffset={6}>
          <Command.Root>
            <Command.Input placeholder="Пошук..." />
            <Command.List>
              <Command.Empty>Нічого не знайдено</Command.Empty>
              <Command.Group>
                {#each filters.categories as c (c.slug)}
                  {@const sel = filterCategories.includes(c.slug)}
                  <Command.Item
                    value={c.name}
                    onSelect={() => toggleCategory(c.slug)}
                  >
                    <div
                      class={cn(
                        'size-4 rounded border flex items-center justify-center shrink-0',
                        sel
                          ? 'bg-foreground border-foreground'
                          : 'border-border',
                      )}
                    >
                      {#if sel}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="3"
                          class="size-3"
                          style="color: var(--background)"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      {/if}
                    </div>
                    {c.name}
                  </Command.Item>
                {/each}
              </Command.Group>
            </Command.List>
          </Command.Root>
        </Popover.Content>
      </Popover.Root>

      <!-- Cities -->
      <Popover.Root bind:open={cityPickerOpen}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="outline"
              size="sm"
              class={cn(
                'gap-1.5 rounded-full font-normal',
                filterCities.length > 0 && 'border-foreground',
              )}
            >
              <MapPin class="size-3.5 opacity-60" />
              {filterCities.length > 0
                ? `Міста: ${filterCities.length}`
                : 'Місто'}
              <ChevronsUpDown class="size-3 opacity-40" />
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-72 p-0" align="start" sideOffset={6}>
          <Command.Root>
            <Command.Input placeholder="Пошук..." />
            <Command.List>
              <Command.Empty>Нічого не знайдено</Command.Empty>
              <Command.Group>
                {#each filters.cities as c (c.slug)}
                  {@const sel = filterCities.includes(c.slug)}
                  <Command.Item
                    value={c.name}
                    onSelect={() => toggleCity(c.slug)}
                  >
                    <div
                      class={cn(
                        'size-4 rounded border flex items-center justify-center shrink-0',
                        sel
                          ? 'bg-foreground border-foreground'
                          : 'border-border',
                      )}
                    >
                      {#if sel}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="3"
                          class="size-3"
                          style="color: var(--background)"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      {/if}
                    </div>
                    {c.name}
                    {#if c.region}
                      <span class="ml-auto text-xs text-muted-foreground"
                        >{c.region}</span
                      >
                    {/if}
                  </Command.Item>
                {/each}
              </Command.Group>
            </Command.List>
          </Command.Root>
        </Popover.Content>
      </Popover.Root>

      {#if activeFiltersCount > 0}
        <Button
          variant="ghost"
          size="sm"
          class="rounded-full gap-1 text-muted-foreground"
          onclick={clearFilters}
        >
          <X class="size-3.5" />
          Скинути
        </Button>
      {/if}
    </div>

    {#if priceOpen}
      <div
        class="rounded-xl p-4 flex items-center gap-2"
        style="background-color: var(--card); border: 1px solid var(--border)"
      >
        <span class="text-sm shrink-0" style="color: var(--muted-foreground)"
          >Ціна, ₴:</span
        >
        <Input
          type="number"
          placeholder="Від"
          bind:value={filterMinPrice}
          min={0}
          class="h-9 tabular-nums"
        />
        <span style="color: var(--muted-foreground)">—</span>
        <Input
          type="number"
          placeholder="До"
          bind:value={filterMaxPrice}
          min={0}
          class="h-9 tabular-nums"
        />
      </div>
    {/if}
  </div>
{/if}

<!-- List -->
{#if jobs.length === 0 && !loadingMore}
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
      Немає доступних заявок
    </h2>
    <p class="text-sm" style="color: var(--muted-foreground)">
      Перевірте пізніше або змініть фільтри
    </p>
  </div>
{:else}
  <div class="space-y-3">
    {#each jobs as job (job.id)}
      <a
        href={`/jobs/${job.id}`}
        class="block rounded-2xl p-5 transition-all hover:-translate-y-0.5 group"
        style="background-color: var(--card); border: 1px solid var(--border)"
      >
        <div class="flex items-center justify-between gap-2 mb-2.5">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs" style="color: var(--muted-foreground)"
              >{formatRelative(job.createdAt)}</span
            >
            <span class="text-xs" style="color: var(--muted-foreground)"
              >· Активна ще {expiresIn(job.expiresAt)}</span
            >
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

        <!-- Client info -->
        {#if job.client}
          {@const client = job.client as {
            id: string
            name: string | null
            username: string | null
            avatar: string | null
            avgRating: number
            reviewsCount: number
          }}
          <div
            class="flex items-center gap-2 pt-3"
            style="border-top: 1px solid var(--border)"
          >
            <Avatar class="size-8 shrink-0">
              <AvatarImage src={client.avatar ?? ''} alt={client.name ?? ''} />
              <AvatarFallback class="text-xs font-semibold"
                >{initials(client.name)}</AvatarFallback
              >
            </Avatar>
            <div class="min-w-0">
              <p
                class="text-sm font-medium truncate"
                style="color: var(--foreground)"
              >
                {client.name ?? 'Замовник'}
              </p>
              {#if client.reviewsCount > 0}
                <p
                  class="text-[11px] inline-flex items-center gap-1"
                  style="color: var(--muted-foreground)"
                >
                  <Star class="size-3" style="color: #f5a623; fill: #f5a623" />
                  {client.avgRating.toFixed(1)} ({client.reviewsCount})
                </p>
              {/if}
            </div>
          </div>
        {/if}
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
