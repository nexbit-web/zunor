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
    Info,
  } from 'lucide-svelte'

  import { detailIcon } from '$lib/categories/cleaning/detail-icons'

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
  // Коректне укр. відмінювання (1 заявка, 2-4 заявки, 5+ заявок),
  // з урахуванням винятків 11-14 → заявок та 21/22 → заявка/заявки.
  function pluralizeJobs(n: number) {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return `${n} заявка`
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
      return `${n} заявки`
    return `${n} заявок`
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
  <div class="filters">
    <button
      type="button"
      onclick={() => (activeService = '')}
      class="fpill {activeService === '' ? 'fpill--on' : 'fpill--off'}"
    >
      Усі
    </button>
    {#each SERVICES as s (s.key)}
      <button
        type="button"
        onclick={() => (activeService = s.key)}
        class="fpill {activeService === s.key ? 'fpill--on' : 'fpill--off'}"
      >
        {s.label}
      </button>
    {/each}
  </div>
{/if}

{#if !blockReason && visibleJobs.length > 0}
  <p class="count">{pluralizeJobs(visibleJobs.length)}</p>
{/if}

<!-- List -->
{#if visibleJobs.length === 0 && !loadingMore}
  <div
    class="rounded-4xl px-6 py-16 text-center"
    style="background-color: var(--card); border: 1px solid var(--border)"
  >
    <div
      class="size-14 rounded-4xl mx-auto mb-2 flex items-center justify-center"
    >
      <Info class="size-10" style="color: var(--w-icon)" strokeWidth={1.75} />
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
  <!-- key-блок перемонтує сітку при зміні фільтра → повтор анімації появи (як у прикладі) -->
  {#key activeService}
    <div class="grid">
      {#each visibleJobs as job, i (job.id)}
        <a
          href={`/dashboard/jobs/${job.id}`}
          in:fly={{
            y: 12,
            duration: 260,
            delay: Math.min(i, 6) * 40,
            easing: quintOut,
          }}
          class="jcard group"
        >
          <!-- Час -->
          <div class="jcard__top">
            <span class="jmeta">
              <Clock class="size-3" />
              {formatRelative(job.createdAt)}
            </span>
            <ChevronRight class="jchev size-4.5" />
          </div>

          <!-- Заголовок (тип прибирання) -->
          <h3 class="jcard__title">{job.title}</h3>

          <!-- Ключові деталі (чипи) -->
          {#if jobDetails(job).length > 0}
            <div class="jcard__chips">
              {#each jobDetails(job) as d (d.label)}
                {@const Icon = detailIcon(d.icon)}
                {#if d.label === 'Коли'}
                  <!-- Дата — акцентний чип (важливо майстру) -->
                  <span class="jchip jchip--when">
                    {#if Icon}<Icon class="size-3.5" />{/if}
                    {d.value}
                  </span>
                {:else}
                  <span class="jchip">
                    {#if Icon}<Icon class="size-3.5 opacity-60" />{/if}
                    {d.value}
                  </span>
                {/if}
              {/each}
            </div>
          {/if}

          <!-- Клієнт -->
          {#if job.client}
            <div class="jcard__foot">
              <Avatar class="size-9 shrink-0">
                <AvatarImage
                  src={job.client.avatar ?? ''}
                  alt={job.client.name ?? ''}
                />
                <AvatarFallback class="javatar-fallback"
                  >{initials(job.client.name)}</AvatarFallback
                >
              </Avatar>
              <div class="min-w-0 flex-1">
                <p class="jclient-name">{job.client.name ?? 'Замовник'}</p>
                {#if job.client.reviewsCount > 0}
                  <span class="jrating">
                    <Star
                      class="size-3"
                      style="color: #f5a623; fill: #f5a623"
                    />
                    <strong>{job.client.avgRating.toFixed(1)}</strong>
                    ({job.client.reviewsCount})
                  </span>
                {:else}
                  <span class="jnewclient">Новий клієнт</span>
                {/if}
              </div>
            </div>
          {/if}
        </a>
      {/each}
    </div>
  {/key}

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
  /* ── filters (як у прикладі) ── */
  .filters {
    display: flex;
    gap: 8px;
    /* мобільний: один рядок з горизонтальним скролом */
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    /* витікання до країв екрана (компенсує px-4 контейнера) */
    margin: 0 -5px 22px;
    padding: 0 16px;
    /* плавний скрол з прилипанням до пілюль */
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;
  }
  .filters::-webkit-scrollbar {
    display: none;
  }
  .fpill {
    scroll-snap-align: start;
  }
  /* десктоп: пілюлі переносяться на новий рядок, без скролу */
  @media (min-width: 640px) {
    .filters {
      flex-wrap: wrap;
      overflow-x: visible;
      margin: 0 0 22px;
      padding: 0;
    }
  }
  .fpill {
    height: 38px;
    padding: 0 16px;
    border-radius: 999px;
    border: 1px solid transparent;
    font-size: 13.5px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      opacity 0.15s ease;
  }
  .fpill--on {
    background: var(--foreground);
    color: var(--background);
  }
  .fpill--off {
    background: var(--card);
    color: var(--foreground);
    border: 1px solid var(--border);
    transition: all 0.3s;
  }
  .fpill--off:hover {
    opacity: 0.72;
   
    background-color: var(--card);
  }

  /* ── count (як у прикладі) ── */
  .count {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--muted-foreground);
    margin: 0 0 16px;
  }

  /* ── grid (як у прикладі, але адаптивний) ── */
  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }
  @media (min-width: 640px) {
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
    }
  }

  /* ── card ── */
  .jcard {
    display: block;
    text-decoration: none;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 2rem;
    padding: 18px;
    cursor: pointer;
    transition:
      transform 0.18s ease,
      border-color 0.18s ease;
  }
  .jcard:hover {
    transform: translateY(-1px);
    border-color: var(--border);
  }
  .jcard__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 11px;
  }
  .jmeta {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--muted-foreground);
    font-weight: 500;
  }
  /* :global бо клас потрапляє на <svg>, який рендерить компонент ChevronRight */
  .jcard :global(.jchev) {
    color: var(--foreground);
    opacity: 0;
    transform: translateX(-4px);
    flex-shrink: 0;
    transition:
      opacity 0.18s ease,
      transform 0.18s ease;
  }
  .jcard:hover :global(.jchev) {
    opacity: 1;
    transform: translateX(0);
  }
  .jcard__title {
    font-size: 17px;
    line-height: 1.32;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--foreground);
    margin: 0 0 14px;
    text-wrap: pretty;
  }
  .jcard__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-bottom: 16px;
  }
  .jchip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 11px;
    border-radius: 999px;
    font-size: 12.5px;
    font-weight: 500;
    background: var(--secondary);
    color: var(--foreground);
  }
  .jchip--when {
    font-weight: 600;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary-hover);
  }
  .jcard__foot {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }
  .jclient-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
  }
  .jrating {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--muted-foreground);
    white-space: nowrap;
  }
  .jrating strong {
    font-weight: 600;
    color: var(--foreground);
  }
  .jnewclient {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--muted-foreground);
  }
  /* аватар-заглушка під стиль прикладу (ініціали) */
  .jcard :global(.javatar-fallback) {
    background: var(--secondary);
    color: var(--muted-foreground);
    font-size: 13px;
    font-weight: 600;
  }
</style>
