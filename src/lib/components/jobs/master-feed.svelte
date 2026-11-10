<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import * as Alert from '$lib/components/ui/alert'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import PageHead from '$lib/components/dashboard/page-head.svelte'
  import JobCard from './job-card.svelte'
  import JobCardSkeleton from './job-card-skeleton.svelte'
  import ServiceIcon from '$lib/categories/cleaning/service-icon.svelte'
  import { onMount } from 'svelte'
  import { invalidate } from '$app/navigation'
  import { notifications } from '$lib/notifications'
  import ChevronDown from '$lib/components/icons/set/chevron-down.svelte'
  import Check from '$lib/components/icons/set/check.svelte'
  import AlertCircle from '$lib/components/icons/set/circle-alert.svelte'
  import Search from '$lib/components/icons/set/search.svelte'
  import LayoutGrid from '$lib/components/icons/set/layout-grid.svelte'

  import { SERVICES } from '$lib/categories/cleaning/presets'

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

  // Перша сторінка — з load, і саме $derived, а не знімок: коли load
  // перезапускається (нова заявка, повторний перехід), стрічка бере свіжі
  // дані. Догрузка через /api/jobs/feed дописує в той самий масив.
  let jobs = $derived([...initialJobs])
  let nextCursor = $derived<string | null>(initialNextCursor)
  let loadingMore = $state(false)
  let sentinelEl = $state<HTMLDivElement | null>(null)

  const ALL = 'all'
  let activeService = $state<string>(ALL)

  const filterLabel = $derived(
    activeService === ALL
      ? 'Усі послуги'
      : (SERVICES.find((s) => s.key === activeService)?.label ?? 'Усі послуги'),
  )

  function buildQuery(cursor: string | null) {
    const p = new URLSearchParams({ view: 'feed' })
    if (cursor) p.set('cursor', cursor)
    return p.toString()
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

  // Дзвіночок каже «є нова заявка» — стрічка оновлюється сама, а не
  // показує «поки немає» до F5.
  onMount(() =>
    notifications.onNotification((n) => {
      if (n.type === 'NEW_JOB') void invalidate('app:jobs-feed')
    }),
  )

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
    activeService !== ALL
      ? jobs.filter((j) => {
          const meta = j.metadata as Record<string, unknown> | null
          return meta?.service === activeService
        })
      : jobs,
  )

  /** Заявка, на яку ще реально встигнути: дві години з публікації.
      Для майстра це єдине, що варте кольору в картці. */
  function isFresh(iso: string) {
    return Date.now() - new Date(iso).getTime() < 2 * 60 * 60_000
  }
</script>

<PageHead>
  <div class="flex items-center justify-between gap-3">
    <h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
      Заявки поруч
    </h1>

    <!-- Фільтр — як у «Замовленнях»: приглушена кнопка «Показати: …».
         Смуга пілюль замість неї їхала в горизонтальний скрол і ховала
         останні послуги за краєм екрана без жодного натяку, що вони є.

         Показуємо по `jobs`, а не по `visibleJobs`: коли під обраний
         фільтр нічого не підпало, кнопка мусить лишитись — інакше з
         порожнього екрана не повернутись. -->
    {#if !blockReason && jobs.length > 0}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="secondary"
              size="sm"
              class="shrink-0 font-normal text-muted-foreground"
            >
              <span class="hidden sm:inline">Показати:</span>
              <span class="font-medium text-foreground">{filterLabel}</span>
              <ChevronDown class="size-3.5 opacity-60" />
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>

        <!-- Компактне меню з іконками послуг — тими самими, що в
             картках: послугу впізнаєш оком, ще не дочитавши назву. -->
        <!-- Вигляд меню й пунктів — зі спільного ui/dropdown-menu (як у
             референсі в docs/); тут лише ширина. -->
        <DropdownMenu.Content align="end" class="w-auto min-w-56">
          {#each [{ key: ALL, label: 'Усі послуги' }, ...SERVICES] as option (option.key)}
            <DropdownMenu.Item
              class="cursor-pointer"
              onclick={() => (activeService = option.key)}
            >
              {#if option.key === ALL}
                <LayoutGrid
                  class="size-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.75}
                />
              {:else}
                <ServiceIcon service={option.key} class="size-4 shrink-0" />
              {/if}
              <span class="min-w-0 flex-1 truncate">{option.label}</span>
              {#if activeService === option.key}
                <Check class="size-4 shrink-0 text-primary" />
              {/if}
            </DropdownMenu.Item>
            {#if option.key === ALL}
              <DropdownMenu.Separator />
            {/if}
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}
  </div>
</PageHead>

{#if blockReason}
  <Alert.Root variant="destructive" class="mt-2">
    <AlertCircle />
    <Alert.Title>{blockReason}</Alert.Title>
    <Alert.Description>
      Заповніть профіль майстра, щоб бачити доступні заявки.
      <Button
        variant="link"
        size="sm"
        href="/dashboard/settings/profile"
        class="mt-1 h-auto p-0"
      >
        Перейти до налаштувань →
      </Button>
    </Alert.Description>
  </Alert.Root>
{:else if visibleJobs.length === 0 && !loadingMore}
  <div
    class="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center"
  >
    <Search class="size-14 text-muted-foreground/70" strokeWidth={1} />
    <h2 class="mt-6 text-lg font-medium">
      {activeService !== ALL ? 'Немає заявок цього типу' : 'Поки немає заявок'}
    </h2>
    <p class="mt-2 max-w-90 text-sm leading-relaxed text-muted-foreground">
      {activeService !== ALL
        ? 'Спробуйте інший фільтр.'
        : 'Щойно поруч зʼявиться заявка, ми надішлемо сповіщення.'}
    </p>
    {#if activeService !== ALL}
      <Button
        variant="secondary"
        size="sm"
        class="mt-6"
        onclick={() => (activeService = ALL)}
      >
        Показати всі
      </Button>
    {/if}
  </div>
{:else}
  <ul class="mt-2 flex flex-col gap-3">
    {#each visibleJobs as job (job.id)}
      <JobCard
        href={`/dashboard/jobs/${job.id}`}
        title={job.title}
        description={job.description}
        metadata={job.metadata}
        createdAt={job.createdAt}
        budgetMinCents={job.budgetMinCents}
        budgetMaxCents={job.budgetMaxCents}
        currency={job.currency}
        fresh={isFresh(job.createdAt)}
        match={job.match}
        client={job.client}
        place={job.place}
      />
    {/each}
  </ul>

  <div bind:this={sentinelEl} class="h-1"></div>
  {#if loadingMore}
    <JobCardSkeleton count={2} />
  {/if}
  {#if !nextCursor && visibleJobs.length > 0 && !loadingMore}
    <p class="py-8 text-center text-xs text-muted-foreground">Це всі заявки</p>
  {/if}
{/if}
