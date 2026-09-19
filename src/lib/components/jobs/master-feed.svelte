<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import * as Alert from '$lib/components/ui/alert'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import PageHead from '$lib/components/dashboard/page-head.svelte'
  import JobCardSkeleton from './job-card-skeleton.svelte'
  import { onMount, untrack } from 'svelte'
  import { fly } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import {
    Star,
    ChevronDown,
    Check,
    AlertCircle,
    Search,
    Sparkles,
  } from 'lucide-svelte'

  import { formatRelative } from '$lib/utils/time'

  // serviceName, а не serviceLabel: локальна змінна з такою назвою вже
  // тримає підпис кнопки фільтра.
  import {
    SERVICES,
    serviceLabel as serviceName,
  } from '$lib/categories/cleaning/presets'

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

  // untrack: перша сторінка з SSR — це ПОЧАТКОВИЙ знімок. Далі стрічка
  // росте догрузкою через /api/jobs/feed, і перезапис пропом стер би її.
  let jobs = $state(untrack(() => [...initialJobs]))
  let nextCursor = $state<string | null>(untrack(() => initialNextCursor))
  let loadingMore = $state(false)
  let sentinelEl = $state<HTMLDivElement | null>(null)

  const ALL = 'all'
  let activeService = $state<string>(ALL)

  const serviceLabel = $derived(
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

  /** Тип послуги з metadata — те, чим заявка є. Фолбек на назву
      категорії: старі заявки metadata.service могли не мати. */
  function serviceOf(job: any) {
    const key = (job.metadata as Record<string, unknown> | null)?.service
    return typeof key === 'string' ? serviceName(key) : 'Прибирання'
  }

  /** Заявка, на яку ще реально встигнути: дві години з публікації.
      Для майстра це єдине, що варте кольору в рядку. */
  function isFresh(iso: string) {
    return Date.now() - new Date(iso).getTime() < 2 * 60 * 60_000
  }
</script>

<PageHead>
  <div class="flex items-center justify-between gap-3">
    <h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
      Заявки поруч
    </h1>

    <!-- Фільтр — звичайна приглушена кнопка, на місці головної дії: у
         майстра на цьому екрані іншої дії немає. Смуга пілюль замість
         неї їхала в горизонтальний скрол і ховала останні послуги за
         краєм екрана без жодного натяку, що вони є.

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
              class="shrink-0 rounded-full"
            >
              {serviceLabel}
              <ChevronDown />
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
                <Check class="size-4 shrink-0 text-primary" />
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
        : 'Зайдіть пізніше — нові заявки зʼявляються щодня.'}
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
  <!-- key-блок перемонтує список при зміні фільтра → повтор анімації -->
  {#key activeService}
    <div class="mt-4 space-y-3">
      {#each visibleJobs as job, i (job.id)}
        <a
          href={`/dashboard/jobs/${job.id}`}
          in:fly={{
            y: 8,
            duration: 220,
            delay: Math.min(i, 6) * 30,
            easing: quintOut,
          }}
          class="block rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-border hover:bg-accent/30 sm:p-5"
        >
          <div class="flex items-center gap-2">
            <Sparkles class="size-4 shrink-0 text-primary" />
            <span
              class="rounded-full bg-muted px-2.5 py-0.5 text-[12.5px] font-medium text-muted-foreground"
            >
              {serviceOf(job)}
            </span>

            {#if isFresh(job.createdAt)}
              <!-- Колір дістається тільки свіжим заявкам: на них ще
                   реально встигнути, і саме це майстер шукає очима. -->
              <span
                class="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary"
              >
                <span class="live-dot size-1.5 rounded-full bg-primary"></span>
                Щойно
              </span>
            {/if}
          </div>

          <h3
            class="mt-3 text-[17px] leading-snug font-semibold text-pretty text-foreground"
          >
            {job.title}
          </h3>

          {#if job.description}
            <p
              class="mt-1.5 line-clamp-2 text-[15px] leading-relaxed text-muted-foreground"
            >
              {job.description}
            </p>
          {/if}

          <div
            class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground"
          >
            {#if job.client}
              <span class="inline-flex min-w-0 items-center gap-1.5">
                <span class="truncate">{job.client.name ?? 'Замовник'}</span>
                {#if job.client.reviewsCount > 0}
                  <Star class="size-3 shrink-0 fill-amber-400 text-amber-400" />
                  <span class="font-medium text-foreground">
                    {job.client.avgRating.toFixed(1)}
                  </span>
                {/if}
              </span>
            {/if}

            <span class="ms-auto">{formatRelative(job.createdAt)}</span>
          </div>
        </a>
      {/each}
    </div>
  {/key}

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
