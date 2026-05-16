<!-- src/lib/components/notifications/notification-bell.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { goto } from '$app/navigation'
  import { Bell, X, Check } from 'lucide-svelte'
  import * as Popover from '$lib/components/ui/popover'
  import { getPusher } from '$lib/pusher-client'

  interface Props {
    /** ID поточного юзера для Pusher subscribe */
    userId: string
  }

  let { userId }: Props = $props()

  interface Notification {
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

  let items = $state<Notification[]>([])
  let unreadCount = $state(0)
  let loading = $state(false)
  let open = $state(false)
  let initialized = $state(false)

  let pusherChannel: any = null

  // ─── Initial load ───
  async function load() {
    loading = true
    try {
      const res = await fetch('/api/notifications?limit=20')
      if (!res.ok) return
      const json = await res.json()
      items = json.items
      unreadCount = json.unreadCount
    } finally {
      loading = false
    }
  }

  // ─── Pusher subscribe ───
  onMount(async () => {
    await load()
    initialized = true

    const pusher = getPusher()
    pusherChannel = pusher.subscribe(`private-user-${userId}`)
    pusherChannel.bind('notification', (data: any) => {
      items = [data, ...items].slice(0, 50)
      unreadCount++

      // Зіграти короткий "діньк" якщо є sound
      try {
        const audio = new Audio('/notification.mp3')
        audio.volume = 0.3
        audio.play().catch(() => {})
      } catch {}
    })
  })

  onDestroy(() => {
    if (pusherChannel) {
      pusherChannel.unbind_all()
      pusherChannel.unsubscribe()
    }
  })

  // ─── Actions ───
  async function markRead(id: string) {
    items = items.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    if (items.find((n) => n.id === id && !n.isRead)) {
      unreadCount = Math.max(0, unreadCount - 1)
    }
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-read', ids: [id] }),
    })
  }

  async function markAllRead() {
    items = items.map((n) => ({ ...n, isRead: true }))
    unreadCount = 0
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-all-read' }),
    })
  }

  function notificationLink(n: Notification): string {
    if (n.orderId) return `/orders/${n.orderId}`
    if (n.proposalId) return `/dashboard/proposals`
    if (n.jobId) return `/jobs/${n.jobId}`
    if (n.chatId) return `/messages/${n.chatId}`
    return '#'
  }

  async function handleClick(n: Notification) {
    if (!n.isRead) await markRead(n.id)
    open = false
    goto(notificationLink(n))
  }

  function formatRelative(iso: string): string {
    const date = new Date(iso)
    const diffMs = Date.now() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr = Math.floor(diffMin / 60)
    const diffDays = Math.floor(diffHr / 24)
    if (diffMin < 1) return 'щойно'
    if (diffMin < 60) return `${diffMin} хв`
    if (diffHr < 24) return `${diffHr} год`
    return `${diffDays} д`
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="relative size-9 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:opacity-80"
        style="color: var(--foreground)"
        aria-label="Сповіщення"
      >
        <Bell class="size-5" />
        {#if unreadCount > 0}
          <span
            class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1"
            style="background-color: var(--destructive); color: white"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        {/if}
      </button>
    {/snippet}
  </Popover.Trigger>

  <Popover.Content class="w-80 p-0" align="end">
    <div
      class="flex items-center justify-between px-4 py-3"
      style="border-bottom: 1px solid var(--border)"
    >
      <h3 class="text-sm font-semibold" style="color: var(--foreground)">
        Сповіщення
      </h3>
      {#if unreadCount > 0}
        <button
          type="button"
          onclick={markAllRead}
          class="text-xs cursor-pointer hover:underline"
          style="color: var(--primary)"
        >
          Прочитати всі
        </button>
      {/if}
    </div>

    <div class="max-h-[400px] overflow-y-auto">
      {#if !initialized}
        <div class="p-8 text-center">
          <p class="text-xs" style="color: var(--muted-foreground)">
            Завантаження…
          </p>
        </div>
      {:else if items.length === 0}
        <div class="p-8 text-center">
          <Bell
            class="size-8 mx-auto mb-2"
            style="color: var(--muted-foreground); opacity: 0.5"
          />
          <p class="text-xs" style="color: var(--muted-foreground)">
            Немає сповіщень
          </p>
        </div>
      {:else}
        {#each items as n (n.id)}
          <button
            type="button"
            onclick={() => handleClick(n)}
            class="w-full flex items-start gap-3 px-4 py-3 text-left cursor-pointer transition-colors hover:bg-[var(--accent)]"
            style="border-bottom: 1px solid var(--border);
                   background-color: {n.isRead
              ? 'transparent'
              : 'color-mix(in srgb, var(--primary) 5%, transparent)'}"
          >
            {#if !n.isRead}
              <div
                class="size-2 rounded-full shrink-0 mt-2"
                style="background-color: var(--primary)"
              ></div>
            {:else}
              <div class="size-2 shrink-0 mt-2"></div>
            {/if}
            <div class="flex-1 min-w-0">
              <p
                class="text-sm font-medium leading-snug"
                style="color: var(--foreground)"
              >
                {n.title}
              </p>
              {#if n.body}
                <p
                  class="text-xs mt-0.5 leading-snug line-clamp-2"
                  style="color: var(--muted-foreground)"
                >
                  {n.body}
                </p>
              {/if}
              <p
                class="text-[10px] mt-1"
                style="color: var(--muted-foreground)"
              >
                {formatRelative(n.createdAt)}
              </p>
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </Popover.Content>
</Popover.Root>
