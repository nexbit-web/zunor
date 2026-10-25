<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import * as Alert from '$lib/components/ui/alert'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import PageHead from '$lib/components/dashboard/page-head.svelte'
  import JobRow from './job-row.svelte'
  import JobCardSkeleton from './job-card-skeleton.svelte'
  import { onMount } from 'svelte'
  import { invalidate } from '$app/navigation'
  import { notifications } from '$lib/notifications'
  import {
    Star,
    ChevronDown,
    Check,
    AlertCircle,
    Search,
    MapPin,
    Calendar,
  } from 'lucide-svelte'

  import { formatDay, formatRelative } from '$lib/utils/time'
  import { formatDistance } from '$lib/geo/districts'
  import { SERVICES, resolveWhen } from '$lib/categories/cleaning/presets'

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
      Для майстра це єдине, що варте кольору в рядку. */
  function isFresh(iso: string) {
    return Date.now() - new Date(iso).getTime() < 2 * 60 * 60_000
  }

  /** День прибирання з урахуванням «today/tomorrow» від дня створення. */
  function dayOf(job: any): string {
    const iso = resolveWhen(job.metadata?.when, job.createdAt)
    return iso ? formatDay(iso) : ''
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

        <DropdownMenu.Content align="end" class="w-60 rounded-2xl p-1.5">
          {#each [{ key: ALL, label: 'Усі послуги' }, ...SERVICES] as option (option.key)}
            <DropdownMenu.Item
              class="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm outline-none data-highlighted:bg-accent"
              onclick={() => (activeService = option.key)}
            >
              <span class="truncate">{option.label}</span>
              {#if activeService === option.key}
                <Check class="size-4 shrink-0 text-ring" />
              {/if}
            </DropdownMenu.Item>
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
  <ul class="mt-1 border-t border-border/60">
    {#each visibleJobs as job (job.id)}
      {@const fresh = isFresh(job.createdAt)}
      {@const day = dayOf(job)}
      <JobRow
        href={`/dashboard/jobs/${job.id}`}
        service={job.metadata?.service}
        title={job.title}
        description={job.description}
      >
        {#snippet status()}
          <!-- Колір дістається тільки свіжим заявкам: на них ще реально
               встигнути, і саме це майстер шукає очима. -->
          {#if fresh}
            <span
              class="inline-flex h-6 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 text-[12.5px] font-medium whitespace-nowrap text-primary"
            >
              <span class="live-dot size-1.5 rounded-full bg-primary"></span>
              {formatRelative(job.createdAt)}
            </span>
          {:else}
            <span
              class="inline-flex h-6 items-center text-[13px] whitespace-nowrap text-muted-foreground"
            >
              {formatRelative(job.createdAt)}
            </span>
          {/if}
        {/snippet}
        {#snippet meta()}
          {#if day}
            <span class="inline-flex items-center gap-1.5">
              <Calendar class="size-3.5" aria-hidden="true" />
              <span class="text-foreground/80">{day}</span>
            </span>
          {/if}

          <!-- Район, а не адреса: точну адресу клієнт дає в чаті вже
               після угоди. Відстань — від району самого майстра. -->
          {#if job.place?.district}
            <span class="inline-flex min-w-0 items-center gap-1.5">
              <MapPin class="size-3.5 shrink-0" aria-hidden="true" />
              <!-- {' · '} явно: пробіл на початку {#if} Svelte зрізає. -->
              <span class="truncate">
                {job.place
                  .district}{#if job.place.distanceKm !== null}{' · '}{formatDistance(
                    job.place.distanceKm,
                  )}{/if}
              </span>
            </span>
          {/if}

          {#if job.client}
            <span class="inline-flex min-w-0 items-center gap-1">
              <span class="truncate">{job.client.name ?? 'Замовник'}</span>
              {#if job.client.reviewsCount > 0}
                <Star
                  class="size-3 shrink-0 fill-amber-400 text-amber-400"
                  aria-hidden="true"
                />
                <span class="font-medium text-foreground/80">
                  {job.client.avgRating.toFixed(1)}
                </span>
              {/if}
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
  {#if !nextCursor && visibleJobs.length > 0 && !loadingMore}
    <p class="py-8 text-center text-xs text-muted-foreground">Це всі заявки</p>
  {/if}
{/if}

<style>
  /* Пульс — не прикраса: він відрізняє «іде просто зараз» від статусу,
     який просто написаний словом. І саме тому він рівно один на рядок:
     якби дихало все, не казало б нічого. */
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
