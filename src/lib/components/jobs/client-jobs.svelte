<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import PageHead from '$lib/components/dashboard/page-head.svelte'
  import JobCardSkeleton from './job-card-skeleton.svelte'
  import {
    Plus,
    Briefcase,
    ChevronDown,
    Check,
    MessageSquare,
    Sparkles,
  } from 'lucide-svelte'
  import { onMount, untrack } from 'svelte'
  import { formatRelative } from '$lib/utils/time'
  import { serviceLabel } from '$lib/categories/cleaning/presets'

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
    { value: 'all' as const, label: 'Усі заявки', count: counts.all },
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
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? 'Усі заявки',
  )

  function expiresIn(iso: string) {
    const diff = new Date(iso).getTime() - Date.now()
    if (diff <= 0) return 'Прострочено'
    const days = Math.floor(diff / (24 * 60 * 60_000))
    const hr = Math.floor(diff / (60 * 60_000))
    if (days >= 1) return `${days} дн`
    if (hr >= 1) return `${hr} год`
    return '< 1 год'
  }

  /** Тип послуги з metadata — те, чим заявка є. Фолбек на назву
      категорії: старі заявки metadata.service могли не мати. */
  function serviceOf(job: any) {
    const key = (job.metadata as Record<string, unknown> | null)?.service
    return typeof key === 'string' ? serviceLabel(key) : 'Прибирання'
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

<PageHead>
  <div class="flex items-center justify-between gap-3">
    <h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
      Мої заявки
    </h1>

    <div class="flex shrink-0 items-center gap-2">
      <!-- Фільтр — звичайна кнопка поруч із головною, приглушена: вона
           не дія, а стан списку, і перетягувати увагу на себе їй нема за
           що. П'ять вкладок із лічильниками займали цілий рядок і на
           телефоні переносились у два, хоча обраний завжди рівно один. -->
      {#if counts.all > 0}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="secondary"
                size="sm"
                class="rounded-full"
              >
                {activeLabel}
                <ChevronDown />
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
                  {#if option.count > 0}
                    <span class="text-xs tabular-nums text-muted-foreground">
                      {option.count}
                    </span>
                  {/if}
                </span>
                {#if statusFilter === option.value}
                  <Check class="size-4 shrink-0 text-primary" />
                {/if}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}

      <Button size="sm" href="/dashboard/jobs/new" class="rounded-full">
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
  <!-- Картки. Межу дає ледь помітна рамка, а не тінь: тінь підіймає
       картку над сторінкою, а тут нічого не спливає — це список.
       Заокруглення 16px і поля 16/20px тримають однаковий ритм із
       рештою дашборда. -->
  <div class="mt-4 space-y-3">
    {#each filtered as job (job.id)}
      <a
        href={`/dashboard/jobs/${job.id}`}
        class="block rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-border hover:bg-accent/30 sm:p-5"
      >
        <!-- Верхній рядок — про що заявка: іконка й тег послуги.
             Тег приглушений, бо це класифікація, а не новина. -->
        <div class="flex items-center gap-2">
          <Sparkles class="size-4 shrink-0 text-primary" />
          <span
            class="rounded-full bg-muted px-2.5 py-0.5 text-[12.5px] font-medium text-muted-foreground"
          >
            {serviceOf(job)}
          </span>
        </div>

        <h3 class="mt-3 text-[17px] leading-snug font-semibold text-foreground">
          {job.title}
        </h3>

        {#if job.description}
          <p
            class="mt-1.5 line-clamp-2 text-[15px] leading-relaxed text-muted-foreground"
          >
            {job.description}
          </p>
        {/if}

        <!-- Нижній рядок — стан. Час праворуч: він потрібен лише для
             орієнтації й не має перебивати те, що ліворуч. -->
        <div
          class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground"
        >
          {#if job.status === 'OPEN'}
            <!-- Єдиний колір картки — «пошук іде просто зараз». -->
            <span
              class="inline-flex items-center gap-1.5 font-medium text-primary"
            >
              <span class="live-dot size-1.5 rounded-full bg-primary"></span>
              Шукаємо майстра
            </span>
          {:else}
            <span>{statusLabel(job.status)}</span>
          {/if}

          <span class="inline-flex items-center gap-1.5">
            <MessageSquare class="size-3.5" />
            <span class={job.proposalsCount > 0 ? 'text-foreground' : ''}>
              {job.proposalsCount}
            </span>
          </span>

          <span class="ms-auto">{formatRelative(job.createdAt)}</span>
        </div>
      </a>
    {/each}
  </div>

  <div bind:this={sentinelEl} class="h-1"></div>

  {#if loadingMore}
    <JobCardSkeleton count={2} />
  {/if}
  {#if !nextCursor && jobs.length > 0 && !loadingMore}
    <p class="py-8 text-center text-xs text-muted-foreground">Кінець списку</p>
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
