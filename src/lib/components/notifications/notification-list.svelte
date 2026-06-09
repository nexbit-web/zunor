<!-- src/lib/components/notifications/notification-list.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { getPusher } from '$lib/pusher-client'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { Spinner } from '$lib/components/ui/spinner'
  import {
    Bell,
    BellOff,
    Briefcase,
    Send,
    CheckCircle2,
    Play,
    PartyPopper,
    MessageCircle,
    CheckCheck,
    Trash2,
  } from 'lucide-svelte'
  import type { Channel } from 'pusher-js'

  interface NotificationItem {
    id: string
    type: string
    title: string
    body: string | null
    orderId: string | null
    proposalId: string | null
    jobId: string | null
    chatId: string | null
    isRead: boolean
    createdAt: string
  }

  let {
    userId,
    initialItems,
    initialNextCursor,
    initialUnreadCount,
  }: {
    userId: string
    initialItems: NotificationItem[]
    initialNextCursor: string | null
    initialUnreadCount: number
  } = $props()

  let items = $state<NotificationItem[]>([...initialItems])
  let nextCursor = $state<string | null>(initialNextCursor)
  let unreadCount = $state(initialUnreadCount)
  let filter = $state<'all' | 'unread'>('all')
  let loadingMore = $state(false)
  let reloading = $state(false)
  let sentinelEl = $state<HTMLDivElement | null>(null)

  // ─── Тип → іконка ───
  function iconFor(type: string) {
    switch (type) {
      case 'NEW_JOB':
        return Briefcase
      case 'NEW_PROPOSAL':
        return Send
      case 'PROPOSAL_ACCEPTED':
        return CheckCircle2
      case 'ORDER_STARTED':
        return Play
      case 'ORDER_COMPLETED':
        return PartyPopper
      case 'NEW_MESSAGE':
        return MessageCircle
      default:
        return Bell
    }
  }

  // ─── Куди веде сповіщення (та сама логіка, що в дзвіночку) ───
  function linkFor(n: NotificationItem): string {
    if (n.orderId) return `/orders/${n.orderId}`
    if (n.proposalId) return `/dashboard/proposals`
    if (n.jobId) return `/jobs/${n.jobId}`
    if (n.chatId) return `/messages/${n.chatId}`
    return '/notifications'
  }

  // ─── Час ───
  function formatRelative(iso: string): string {
    const date = new Date(iso)
    const min = Math.floor((Date.now() - date.getTime()) / 60_000)
    const hr = Math.floor(min / 60)
    const days = Math.floor(hr / 24)
    if (min < 1) return 'щойно'
    if (min < 60) return `${min} хв тому`
    if (hr < 24) return `${hr} год тому`
    if (days < 7) return `${days} дн тому`
    return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })
  }

  // ─── Групування по даті ───
  const DAY = 86_400_000
  function bucketOf(iso: string): string {
    const now = new Date()
    const startToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime()
    const t = new Date(iso).getTime()
    if (t >= startToday) return 'Сьогодні'
    if (t >= startToday - DAY) return 'Вчора'
    if (t >= startToday - 7 * DAY) return 'Цього тижня'
    return 'Раніше'
  }

  const groups = $derived.by(() => {
    const order = ['Сьогодні', 'Вчора', 'Цього тижня', 'Раніше']
    const map = new Map<string, NotificationItem[]>()
    for (const n of items) {
      const b = bucketOf(n.createdAt)
      const arr = map.get(b)
      if (arr) arr.push(n)
      else map.set(b, [n])
    }
    return order
      .filter((b) => map.has(b))
      .map((b) => ({ label: b, items: map.get(b)! }))
  })

  // ─── Завантаження ───
  function query(cursor: string | null): string {
    const p = new URLSearchParams({ limit: '20' })
    if (filter === 'unread') p.set('unreadOnly', 'true')
    if (cursor) p.set('cursor', cursor)
    return p.toString()
  }

  async function reload() {
    reloading = true
    try {
      const res = await fetch(`/api/notifications?${query(null)}`)
      if (!res.ok) return
      const j = await res.json()
      items = j.items
      nextCursor = j.nextCursor
      unreadCount = j.unreadCount
    } catch (e) {
      console.error('[notifications:reload]', e)
    } finally {
      reloading = false
    }
  }

  async function loadMore() {
    if (loadingMore || !nextCursor) return
    loadingMore = true
    try {
      const res = await fetch(`/api/notifications?${query(nextCursor)}`)
      if (!res.ok) return
      const j = await res.json()
      items = [...items, ...j.items]
      nextCursor = j.nextCursor
    } catch (e) {
      console.error('[notifications:loadMore]', e)
    } finally {
      loadingMore = false
    }
  }

  function setFilter(f: 'all' | 'unread') {
    if (filter === f) return
    filter = f
    reload()
  }

  // ─── Дії (оптимістично, потім POST) ───
  async function markRead(n: NotificationItem) {
    if (n.isRead) return
    items =
      filter === 'unread'
        ? items.filter((x) => x.id !== n.id)
        : items.map((x) => (x.id === n.id ? { ...x, isRead: true } : x))
    unreadCount = Math.max(0, unreadCount - 1)
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-read', ids: [n.id] }),
      })
    } catch (e) {
      console.error('[notifications:markRead]', e)
    }
  }

  async function openNotification(n: NotificationItem) {
    await markRead(n)
    goto(linkFor(n))
  }

  async function markAllRead() {
    if (unreadCount === 0) return
    items =
      filter === 'unread' ? [] : items.map((x) => ({ ...x, isRead: true }))
    unreadCount = 0
    if (filter === 'unread') nextCursor = null
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-all-read' }),
      })
    } catch (e) {
      console.error('[notifications:markAllRead]', e)
    }
  }

  async function remove(n: NotificationItem) {
    const wasUnread = !n.isRead
    items = items.filter((x) => x.id !== n.id)
    if (wasUnread) unreadCount = Math.max(0, unreadCount - 1)
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids: [n.id] }),
      })
    } catch (e) {
      console.error('[notifications:remove]', e)
    }
  }

  // ─── Realtime ───
  function onIncoming(data: NotificationItem) {
    if (filter === 'unread' && data.isRead) return
    items = [data, ...items.filter((x) => x.id !== data.id)]
    if (!data.isRead) unreadCount++
    // Звук не граємо: цим займається дзвіночок у шапці (спільний канал).
  }

  onMount(() => {
    const channel: Channel = getPusher().subscribe(`private-user-${userId}`)
    channel.bind('notification', onIncoming)

    let obs: IntersectionObserver | null = null
    if (sentinelEl) {
      obs = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && nextCursor && !loadingMore)
            loadMore()
        },
        { rootMargin: '400px' },
      )
      obs.observe(sentinelEl)
    }

    return () => {
      // Канал спільний (дзвіночок і user-menu теж слухають) —
      // відвʼязуємо ЛИШЕ свій хендлер, без unbind_all / unsubscribe.
      channel.unbind('notification', onIncoming)
      obs?.disconnect()
    }
  })
</script>

<!-- Header -->
<header class="mb-5 flex items-start justify-between gap-3">
  <div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
      Сповіщення
    </h1>
    <p class="mt-1.5 text-sm text-muted-foreground">
      {unreadCount > 0 ? `${unreadCount} непрочитаних` : 'Усе прочитано'}
    </p>
  </div>

  {#if unreadCount > 0}
    <Button
      variant="ghost"
      size="sm"
      class="shrink-0 rounded-full text-muted-foreground"
      onclick={markAllRead}
    >
      <CheckCheck class="size-4" />
      Прочитати всі
    </Button>
  {/if}
</header>

<!-- Filter -->
<div class="mb-5 flex gap-2">
  <Button
    variant={filter === 'all' ? 'default' : 'secondary'}
    size="sm"
    class="rounded-full"
    onclick={() => setFilter('all')}
  >
    Усі
  </Button>
  <Button
    variant={filter === 'unread' ? 'default' : 'secondary'}
    size="sm"
    class="rounded-full"
    onclick={() => setFilter('unread')}
  >
    Непрочитані
    {#if unreadCount > 0}
      <Badge
        variant={filter === 'unread' ? 'secondary' : 'default'}
        class="ml-1"
      >
        {unreadCount > 99 ? '99+' : unreadCount}
      </Badge>
    {/if}
  </Button>
</div>

<!-- List -->
{#if reloading && items.length === 0}
  <div class="flex justify-center py-12"><Spinner /></div>
{:else if items.length === 0}
  <div class="rounded-2xl border border-border bg-card px-6 py-16 text-center">
    <div
      class="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted"
    >
      <BellOff class="size-6 text-muted-foreground" strokeWidth={1.75} />
    </div>
    <h2 class="mb-1 text-base font-semibold text-foreground">
      {filter === 'unread' ? 'Непрочитаних немає' : 'Сповіщень поки немає'}
    </h2>
    <p class="text-sm text-muted-foreground">
      {filter === 'unread'
        ? 'Усе прочитано — гарна робота'
        : 'Тут зʼявляться оновлення по заявках, відгуках і замовленнях'}
    </p>
  </div>
{:else}
  {#each groups as group (group.label)}
    <h2
      class="mt-5 mb-2 text-xs font-semibold text-muted-foreground first:mt-0"
    >
      {group.label}
    </h2>
    <ul
      class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card"
    >
      {#each group.items as n (n.id)}
        {@const Icon = iconFor(n.type)}
        <li
          class="flex items-start gap-3 p-3.5 pl-4 {n.isRead
            ? ''
            : 'bg-brand/5'}"
        >
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-[10px] {n.isRead
              ? 'bg-secondary text-muted-foreground'
              : 'bg-brand/15 text-brand'}"
          >
            <Icon class="size-4" />
          </span>

          <button
            type="button"
            class="min-w-0 flex-1 cursor-pointer text-left"
            onclick={() => openNotification(n)}
          >
            <p
              class="text-sm leading-snug text-foreground {n.isRead
                ? 'font-medium'
                : 'font-semibold'}"
            >
              {n.title}
            </p>
            {#if n.body}
              <p
                class="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground"
              >
                {n.body}
              </p>
            {/if}
            <p class="mt-1 text-[11px] text-muted-foreground">
              {formatRelative(n.createdAt)}
            </p>
          </button>

          {#if !n.isRead}
            <span
              class="mt-1.5 size-2 shrink-0 rounded-full bg-brand"
              aria-hidden="true"
            ></span>
          {/if}

          <Button
            variant="ghost"
            size="icon-sm"
            class="shrink-0 text-muted-foreground hover:text-destructive"
            onclick={() => remove(n)}
            aria-label="Видалити сповіщення"
          >
            <Trash2 class="size-4" />
          </Button>
        </li>
      {/each}
    </ul>
  {/each}

  <div bind:this={sentinelEl} class="h-1"></div>
  {#if loadingMore}
    <div class="flex justify-center py-6"><Spinner /></div>
  {/if}
  {#if !nextCursor && items.length > 0 && !loadingMore}
    <p class="py-6 text-center text-xs text-muted-foreground">
      Це всі сповіщення
    </p>
  {/if}
{/if}
