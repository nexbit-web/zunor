<!-- src/lib/components/jobs/master-feed.svelte -->
<script lang="ts">
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import { Card, CardContent, CardFooter } from '$lib/components/ui/card'
  import * as Alert from '$lib/components/ui/alert'
  import * as Tabs from '$lib/components/ui/tabs'
  import JobCardSkeleton from './job-card-skeleton.svelte'
  import { onMount, untrack } from 'svelte'
  import { fly } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import { Star, ChevronRight, AlertCircle, Clock, Search } from 'lucide-svelte'

  import { detailIcon } from '$lib/categories/cleaning/detail-icons'

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

  // untrack: перша сторінка з SSR — це ПОЧАТКОВИЙ знімок. Далі стрічка
  // росте догрузкою через /api/jobs/feed, і перезапис пропом стер би її.
  let jobs = $state(untrack(() => [...initialJobs]))
  let nextCursor = $state<string | null>(untrack(() => initialNextCursor))
  let loadingMore = $state(false)
  let sentinelEl = $state<HTMLDivElement | null>(null)

  // Фільтр по типу послуги
  // 'all', а не порожній рядок: для bits-ui Tabs "" означає «нічого не
  // обрано», тож вкладка «Усі» ніколи не підсвічувалась би активною.
  const ALL = 'all'
  let activeService = $state<string>(ALL)

  function buildQuery(cursor: string | null) {
    const p = new URLSearchParams({ view: 'feed' })
    if (cursor) p.set('cursor', cursor)
    return p.toString()
  }

  // reload() тут колись була, але її ніхто не викликав: фільтр по типу
  // послуги працює на клієнті (visibleJobs), запит до сервера для цього
  // не потрібен. Прибрана, щоб не здавалось, що фільтр ходить у мережу.

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

  // Сітка карток. Один рядок замість блока CSS: колонки самі
  // підлаштовуються під ширину, мінімум 380px на картку.
  const GRID = 'grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(380px,1fr))]'
</script>

<!-- Header -->
<header class="mb-6 flex items-center justify-between gap-3 sm:mb-8">
  <div class="flex min-w-0 items-center gap-2.5">
    <h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
      Заявки поруч
    </h1>
    {#if !blockReason && visibleJobs.length > 0}
      <!-- Лічильник переїхав із окремого рядка під фільтрами сюди:
           одне число, один рядок, менше вертикального шуму. -->
      <span
        class="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary"
      >
        {visibleJobs.length}
      </span>
    {/if}
  </div>
</header>

{#if blockReason}
  <!-- Alert із ui замість власного блока: там кольори були захардкожені
       шістнадцятковими (#f59e0b, #b45309) повз тему, тож у темній вони не
       мінялись. Посилання було <button onclick={goto('/settings')}> —
       такого роуту не існує, воно вело в 404. -->
  <Alert.Root variant="destructive" class="mb-6">
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
{:else}
  <!--
    Фільтр по типу послуги — Tabs із ui. Раніше це були власні `.fpill`
    із рукописним CSS на 40 рядків, який дублював те, що вже вміє List.
    Обгортка зі скролом лишилась: пілюль сім, у рядок вони не влазять.

    Показуємо ЛИШЕ коли є що фільтрувати. Умова саме на `jobs`, а не на
    `visibleJobs`: коли фільтр обрано і під нього нічого не підпало, меню
    мусить лишитись — інакше з порожнього екрана не буде як повернутись.
  -->
  {#if jobs.length > 0}
    <div
      class="mb-5 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Tabs.Root
        value={activeService}
        onValueChange={(v) => (activeService = v)}
      >
        <Tabs.List class="w-max">
          <Tabs.Trigger value={ALL}>Усі</Tabs.Trigger>
          {#each SERVICES as s (s.key)}
            <Tabs.Trigger value={s.key}>{s.label}</Tabs.Trigger>
          {/each}
        </Tabs.List>
      </Tabs.Root>
    </div>
  {/if}

  <!-- List -->
  {#if visibleJobs.length === 0 && !loadingMore}
    <!-- flex-1: знак стоїть по центру сторінки, без підкладки під іконкою.
         Колір іконки був --w-icon — це бурштин зі шкали тостів-попереджень,
         через що «поки немає заявок» виглядало як помилка. -->
    <div
      class="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center"
    >
      <Search class="size-14 text-muted-foreground/70" strokeWidth={1} />
      <h2 class="mt-6 text-lg font-medium">
        {activeService !== ALL
          ? 'Немає заявок цього типу'
          : 'Поки немає заявок'}
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
    <!-- key-блок перемонтує сітку при зміні фільтра → повтор анімації появи -->
    {#key activeService}
      <div class={GRID}>
        {#each visibleJobs as job, i (job.id)}
          <a
            href={`/dashboard/jobs/${job.id}`}
            in:fly={{
              y: 12,
              duration: 260,
              delay: Math.min(i, 6) * 40,
              easing: quintOut,
            }}
            class="group block"
          >
            <Card
              size="sm"
              class="h-full gap-3 rounded-4xl transition-transform group-hover:-translate-y-0.5"
            >
              <CardContent class="space-y-3">
                <div class="flex items-center justify-between gap-2">
                  <span
                    class="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                  >
                    <Clock class="size-3" />
                    {formatRelative(job.createdAt)}
                  </span>
                  <!-- Поява шеврона — group-утилітами Tailwind. Раніше для
                     цього був :global(.jchev), бо клас потрапляв на <svg>
                     всередині компонента іконки. -->
                  <ChevronRight
                    class="size-4.5 shrink-0 -translate-x-1 text-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                  />
                </div>

                <h3
                  class="text-[17px] leading-snug font-semibold text-pretty text-foreground"
                >
                  {job.title}
                </h3>

                {#if jobDetails(job).length > 0}
                  <div class="flex flex-wrap gap-1.5">
                    {#each jobDetails(job) as d (d.label)}
                      {@const Icon = detailIcon(d.icon)}
                      {#if d.label === 'Коли'}
                        <!-- Дата — акцентний чип: майстру це головне.
                           Був var(--primary-hover) — а це #d97757, помаранчевий
                           із попереднього бренду, на синьому фоні акценту. -->
                        <Badge
                          class="h-7 gap-1.5 bg-primary/12 px-2.5 font-semibold text-primary"
                        >
                          {#if Icon}<Icon />{/if}
                          {d.value}
                        </Badge>
                      {:else}
                        <Badge variant="secondary" class="h-7 gap-1.5 px-2.5">
                          {#if Icon}<Icon class="opacity-60" />{/if}
                          {d.value}
                        </Badge>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </CardContent>

              {#if job.client}
                <CardFooter class="gap-2.5 border-t pt-4">
                  <Avatar class="size-9 shrink-0">
                    <AvatarImage src={job.client.avatar ?? ''} alt="" />
                    <AvatarFallback
                      class="bg-secondary text-[13px] font-semibold text-muted-foreground"
                    >
                      {initials(job.client.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold text-foreground">
                      {job.client.name ?? 'Замовник'}
                    </p>
                    {#if job.client.reviewsCount > 0}
                      <span
                        class="inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground"
                      >
                        <Star class="size-3 fill-amber-400 text-amber-400" />
                        <strong class="font-semibold text-foreground">
                          {job.client.avgRating.toFixed(1)}
                        </strong>
                        ({job.client.reviewsCount})
                      </span>
                    {:else}
                      <span
                        class="text-[11.5px] font-medium text-muted-foreground"
                      >
                        Новий клієнт
                      </span>
                    {/if}
                  </div>
                </CardFooter>
              {/if}
            </Card>
          </a>
        {/each}
      </div>
    {/key}

    <div bind:this={sentinelEl} class="h-1"></div>
    {#if loadingMore}
      <div class="{GRID} mt-4">
        <JobCardSkeleton count={2} rounded="rounded-4xl" />
      </div>
    {/if}
    {#if !nextCursor && visibleJobs.length > 0 && !loadingMore}
      <p class="py-8 text-center text-xs text-muted-foreground">
        Це всі заявки
      </p>
    {/if}
  {/if}
{/if}
