<!-- src/lib/components/notifications/notification-list.svelte -->
<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { browser } from '$app/environment'
  import toast from 'svelte-hot-french-toast'
  import { Button } from '$lib/components/ui/button'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import { Spinner } from '$lib/components/ui/spinner'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import {
    BellOff,
    Check,
    CheckCheck,
    ChevronDown,
    Trash2,
  } from 'lucide-svelte'
  import { notifications } from '$lib/notifications'
  import { linkFor, type Notification } from '$lib/notifications/types'

  let {
    initialItems,
    initialNextCursor,
    initialUnreadCount,
  }: {
    initialItems: Notification[]
    initialNextCursor: string | null
    initialUnreadCount: number
  } = $props()

  type Filter = 'all' | 'unread'

  const FILTER_LABELS: Record<Filter, string> = {
    all: 'Усі',
    unread: 'Непрочитані',
  }

  // untrack: SSR дає лише ПОЧАТКОВИЙ знімок стрічки. Далі список живе сам —
  // догрузка по курсору й позначки «прочитано» правлять його локально.
  let items = $state<Notification[]>(untrack(() => [...initialItems]))
  let nextCursor = $state<string | null>(untrack(() => initialNextCursor))
  let filter = $state<Filter>('all')
  let loadingMore = $state(false)
  let reloading = $state(false)
  let sentinelEl = $state<HTMLDivElement | null>(null)

  // Лічильник — зі спільного стору, не власний.
  //
  // Саме тут був баг: сторінка вела своє число, сайдбар — своє. Прочитане
  // на сторінці гасило лише те, що на сторінці, а бейдж у сайдбарі так і
  // висів, бо ці два числа ніхто не зводив між собою.
  //
  // Синхронізуємо ЛИШЕ в браузері: стор — модульний синглтон, і на сервері
  // він спільний для всіх запитів. Записати туди число одного користувача
  // означало б віддати його наступному, хто відкриє сторінку.
  if (browser) notifications.setUnreadCount(untrack(() => initialUnreadCount))

  const unreadCount = $derived(
    browser ? notifications.unreadCount : initialUnreadCount,
  )

  // ─── Час ───

  function formatRelative(iso: string): string {
    const date = new Date(iso)
    const min = Math.floor((Date.now() - date.getTime()) / 60_000)
    const hr = Math.floor(min / 60)
    const days = Math.floor(hr / 24)
    if (min < 1) return 'щойно'
    if (min < 60) return `${min} хв тому`
    if (hr < 24) return `${hr} год тому`
    if (days === 1) return 'учора'
    if (days < 7) return `${days} дн тому`
    return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })
  }

  function formatFull(iso: string): string {
    return new Date(iso).toLocaleString('uk-UA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // ─── Завантаження ───

  function query(cursor: string | null): string {
    const p = new URLSearchParams({ limit: '20' })
    if (filter === 'unread') p.set('unreadOnly', 'true')
    if (cursor) p.set('cursor', cursor)
    return p.toString()
  }

  async function reload(): Promise<void> {
    reloading = true
    try {
      const res = await fetch(`/api/notifications?${query(null)}`)
      if (!res.ok) {
        toast.error('Не вдалося оновити список')
        return
      }
      const j = await res.json()
      items = j.items
      nextCursor = j.nextCursor
      // Сервер щойно перерахував непрочитані — зводимо бейдж із істиною.
      notifications.setUnreadCount(j.unreadCount)
    } catch {
      toast.error('Помилка зʼєднання')
    } finally {
      reloading = false
    }
  }

  async function loadMore(): Promise<void> {
    if (loadingMore || !nextCursor) return
    loadingMore = true
    try {
      const res = await fetch(`/api/notifications?${query(nextCursor)}`)
      if (!res.ok) return
      const j = await res.json()
      // Дублі можливі, якщо поки гортали, прилетіло нове зверху.
      const seen = new Set(items.map((x) => x.id))
      items = [
        ...items,
        ...j.items.filter((x: Notification) => !seen.has(x.id)),
      ]
      nextCursor = j.nextCursor
    } catch {
      // Мовчки: сентинел лишиться на місці, наступний скрол спробує знову.
    } finally {
      loadingMore = false
    }
  }

  function setFilter(f: Filter): void {
    if (filter === f) return
    filter = f
    void reload()
  }

  // ─── Дії ───
  //
  // Скрізь однаково: спочатку правимо список у себе, потім питаємо сервер,
  // і якщо той не погодився — вертаємо як було. Стор так само відкочує свій
  // лічильник, тож бейдж і список ніколи не розходяться.

  async function markRead(n: Notification): Promise<void> {
    if (n.isRead) return

    const prev = items
    items =
      filter === 'unread'
        ? items.filter((x) => x.id !== n.id)
        : items.map((x) => (x.id === n.id ? { ...x, isRead: true } : x))

    if (!(await notifications.markRead([n.id]))) {
      items = prev
      toast.error('Не вдалося позначити прочитаним')
    }
  }

  async function markAllRead(): Promise<void> {
    if (unreadCount === 0) return

    const prevItems = items
    const prevCursor = nextCursor

    items =
      filter === 'unread' ? [] : items.map((x) => ({ ...x, isRead: true }))
    if (filter === 'unread') nextCursor = null

    if (!(await notifications.markAllRead())) {
      items = prevItems
      nextCursor = prevCursor
      toast.error('Не вдалося позначити прочитаними')
    }
  }

  async function confirmRemove(): Promise<void> {
    const n = pendingDelete
    if (!n) return

    deleteOpen = false

    const prev = items
    items = items.filter((x) => x.id !== n.id)

    // Успіх не тостимо: рядок зник на очах, це і є відповідь.
    if (!(await notifications.remove([n.id], n.isRead ? 0 : 1))) {
      items = prev
      toast.error('Не вдалося видалити сповіщення')
    }
  }

  // ─── Видалення: підтвердження ───

  let deleteOpen = $state(false)
  // Не скидаємо в null при закритті — інакше текст діалогу зникне
  // прямо посеред анімації виходу.
  let pendingDelete = $state<Notification | null>(null)

  function askRemove(n: Notification): void {
    pendingDelete = n
    deleteOpen = true
  }

  // ─── Realtime ───

  onMount(() => {
    // Підписка спільна зі стором — своєї сторінка не тримає.
    const offNotification = notifications.onNotification((n) => {
      items = [n, ...items.filter((x) => x.id !== n.id)]
    })

    let obs: IntersectionObserver | null = null
    if (sentinelEl) {
      obs = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && nextCursor && !loadingMore)
            void loadMore()
        },
        { rootMargin: '400px' },
      )
      obs.observe(sentinelEl)
    }

    return () => {
      offNotification()
      obs?.disconnect()
    }
  })
</script>

<header class="mb-6 flex items-center justify-between gap-3 sm:mb-8">
  <div class="flex min-w-0 items-center gap-2.5">
    <h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
      Сповіщення
    </h1>
    {#if unreadCount > 0}
      <span
        class="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary"
      >
        {unreadCount > 99 ? '99+' : unreadCount}
      </span>
    {/if}
  </div>

  <div class="flex shrink-0 items-center gap-2">
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
            <span class="font-medium text-foreground">
              {FILTER_LABELS[filter]}
            </span>
            <ChevronDown class="size-3.5 opacity-60" />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-44 rounded-2xl p-1.5">
        {#each ['all', 'unread'] as const as value (value)}
          <DropdownMenu.Item
            class="flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm outline-none data-highlighted:bg-accent"
            onclick={() => setFilter(value)}
          >
            <span>{FILTER_LABELS[value]}</span>
            {#if filter === value}
              <Check class="size-4 text-ring" />
            {/if}
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    {#if unreadCount > 0}
      <Button
        size="sm"
        onclick={markAllRead}
        title="Позначити всі прочитаними"
      >
        <CheckCheck />
        <span class="hidden sm:inline">Прочитати всі</span>
      </Button>
    {/if}
  </div>
</header>

{#if reloading && items.length === 0}
  <!-- Скелет, а не спінер: список уже має форму, і вона не стрибне,
       коли приїдуть дані. -->
  <ul class="border-t border-border/60" aria-busy="true">
    {#each Array.from({ length: 6 }), i (i)}
      <li
        class="flex items-center justify-between gap-6 border-b border-border/60 py-4.5"
      >
        <Skeleton class="h-4 w-[min(60%,22rem)]" />
        <Skeleton class="h-3.5 w-20 shrink-0" />
      </li>
    {/each}
  </ul>
{:else if items.length === 0}
  <!-- flex-1: порожній стан займає всю висоту, що лишилась під шапкою,
       і знак стоїть по центру сторінки, а не тулиться до заголовка. -->
  <div
    class="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center"
  >
    <BellOff class="size-14 text-muted-foreground/70" strokeWidth={1} />
    <h2 class="mt-6 text-lg font-medium">
      {filter === 'unread' ? 'Непрочитаних немає' : 'Сповіщень поки немає'}
    </h2>
    <p class="mt-2 max-w-90 text-sm leading-relaxed text-muted-foreground">
      {filter === 'unread'
        ? 'Ви все переглянули.'
        : 'Тут зʼявляться оновлення по заявках, відгуках і замовленнях.'}
    </p>
    {#if filter === 'unread'}
      <Button
        variant="secondary"
        size="sm"
        class="mt-6  "
        onclick={() => setFilter('all')}
      >
        Показати всі
      </Button>
    {/if}
  </div>
{:else}
  <ul class="border-t border-border/60">
    {#each items as n (n.id)}
      <li class="group relative border-b border-border/60">
        <div
          class="-mx-3 flex items-center gap-4 rounded-lg px-3 py-4 transition-colors group-hover:bg-muted/40"
        >
          <!-- Розтягнуте посилання: клікабельний увесь рядок, але це
               справжній <a> — працюють середня кнопка й «відкрити в
               новій вкладці». Кнопка видалення лишається зверху за z. -->
          <a
            href={linkFor(n)}
            onclick={() => markRead(n)}
            class="min-w-0 flex-1 after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            <span class="flex items-center gap-2">
              {#if !n.isRead}
                <span
                  class="size-1.5 shrink-0 rounded-full bg-primary"
                  aria-label="Непрочитане"
                ></span>
              {/if}
              <span
                class="truncate text-[15px] {n.isRead
                  ? 'text-foreground/90'
                  : 'font-medium text-foreground'}"
              >
                {n.title}
              </span>
            </span>
            {#if n.body}
              <span
                class="mt-0.5 block truncate text-[13px] text-muted-foreground {n.isRead
                  ? ''
                  : 'pl-3.5'}"
              >
                {n.body}
              </span>
            {/if}
          </a>

          <time
            datetime={n.createdAt}
            title={formatFull(n.createdAt)}
            class="shrink-0 text-[13px] whitespace-nowrap text-muted-foreground"
          >
            {formatRelative(n.createdAt)}
          </time>

          <!-- На тачі ховера не буває, тож там кнопка видна завжди;
               ховер ховає її лише на пристроях із курсором. -->
          <Button
            variant="ghost"
            size="icon-sm"
            class="relative z-10 shrink-0 rounded-full text-muted-foreground transition-opacity hover:bg-destructive/10 hover:text-destructive pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
            onclick={() => askRemove(n)}
            aria-label="Видалити сповіщення «{n.title}»"
          >
            <Trash2 />
          </Button>
        </div>
      </li>
    {/each}
  </ul>

  <div bind:this={sentinelEl} class="h-1"></div>

  {#if loadingMore}
    <div class="flex justify-center py-6"><Spinner /></div>
  {:else if !nextCursor}
    <p class="py-6 text-center text-xs text-muted-foreground">
      Це всі сповіщення
    </p>
  {/if}
{/if}

<AlertDialog.Root bind:open={deleteOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Видалити сповіщення?</AlertDialog.Title>
      <AlertDialog.Description>
        {#if pendingDelete}
          {pendingDelete.title}
        {/if}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Скасувати</AlertDialog.Cancel>
      <AlertDialog.Action variant="destructive" onclick={confirmRemove}>
        Видалити
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
