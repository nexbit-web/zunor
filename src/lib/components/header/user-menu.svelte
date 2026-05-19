<!-- src/lib/components/header/user-menu.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import * as Popover from '$lib/components/ui/popover'
  import {
    Bell,
    MessageSquare,
    MessageCircle,
    User,
    LogOut,
    Settings,
    CircleUserRound,
    Briefcase,
    ClipboardList,
  } from 'lucide-svelte'
  import { signOut } from '$lib/auth-client'
  import { goto, invalidateAll, invalidate } from '$app/navigation'
  import { page } from '$app/state'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { getPusher, disconnectPusher } from '$lib/pusher-client'

  let { onnavigate }: { onnavigate: (url: string) => void } = $props()

  const session = $derived(page.data.session)
  const isLoggedIn = $derived(!!session?.user)
  const user = $derived(
    session?.user
      ? {
          name: session.user.name ?? 'Користувач',
          email: session.user.email ?? '',
          avatar: session.user.image ?? '',
          initials: (session.user.name ?? 'U')[0].toUpperCase(),
        }
      : null,
  )

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

  // messageCount — берём из chatStore реактивно
  const messageCount = $derived(chatStore.totalUnread)

  // ─── Initial state — берём бейджи из page.data (SSR, мгновенно) ───
  let notifUnreadCount = $state(page.data.badges?.notifications ?? 0)
  let notifications = $state<Notification[]>([])
  let notifPopoverOpen = $state(false)
  let notifLoading = $state(false)
  let notifInitialized = $state(false)

  // Отдельный Pusher канал ТОЛЬКО для нотификаций
  // chatStore уже держит private-user-{id} для сообщений
  // Нам нужен тот же канал, но bind только на 'notification'
  let notifChannel: ReturnType<
    ReturnType<typeof getPusher>['subscribe']
  > | null = null

  // ─── Badges ───
  async function loadBadges() {
    if (!session?.user?.id) return
    try {
      const res = await fetch('/api/me/badges')
      if (!res.ok) return
      const data = await res.json()
      // ИСПРАВЛЕНО: API возвращает поле "notifications", а не "unreadNotifications"
      notifUnreadCount = data.notifications ?? 0
      // messageCount берём из chatStore, не из badges
    } catch {}
  }

  // ─── Notifications list ───
  async function loadNotifications() {
    if (!session?.user?.id || notifInitialized) return
    notifLoading = true
    try {
      const res = await fetch('/api/notifications?limit=20')
      if (!res.ok) return
      const json = await res.json()
      notifications = json.items
      notifUnreadCount = json.unreadCount
      notifInitialized = true
    } catch {
    } finally {
      notifLoading = false
    }
  }

  async function markNotifRead(id: string) {
    notifications = notifications.map((n) =>
      n.id === id ? { ...n, isRead: true } : n,
    )
    notifUnreadCount = Math.max(0, notifUnreadCount - 1)
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-read', ids: [id] }),
    }).catch(() => {})
  }

  async function markAllNotifRead() {
    notifications = notifications.map((n) => ({ ...n, isRead: true }))
    notifUnreadCount = 0
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-all-read' }),
    }).catch(() => {})
  }

  // ─── Pusher — ТОЛЬКО для нотификаций ───
  // chatStore сам подписывается на private-user-{id} для chat:update / message:new
  // Pusher позволяет bind разных событий из разных мест на одном канале — это OK
  // Главное — НЕ subscribe() дважды, а использовать уже открытый канал
  function setupNotifListener() {
    const userId = session?.user?.id
    if (!userId) return
    try {
      const pusher = getPusher()
      // Используем тот же канал что и chatStore — подписка уже есть
      // Просто добавляем bind на 'notification'
      notifChannel = pusher.subscribe(`private-user-${userId}`)
      notifChannel.bind(
        'notification:new',
        (data: { notification: Notification }) => {
          const notif = data.notification
          notifications = [notif, ...notifications].slice(0, 50)
          notifUnreadCount++
        },
      )
    } catch (err) {
      console.error('[notif:pusher]', err)
    }
  }

  // Было: fetch + chatStore.setChats
  // Стало: данные уже в page.data
  function initChats() {
    if (!session?.user?.id) return
    if (chatStore.initialized) return

    const ssrChats = page.data.chats
    if (ssrChats) {
      chatStore.setChats(ssrChats)
    }

    // Pusher всё равно нужен — для realtime событий
    chatStore.subscribeToUserEvents(session.user.id).catch(() => {})
  }

  // ─── Navigation ───
  function notifLink(n: Notification): string {
    if (n.orderId) return `/orders/${n.orderId}`
    if (n.type === 'NEW_PROPOSAL' && n.jobId) return `/jobs/${n.jobId}`
    if (n.jobId) return `/jobs/${n.jobId}`
    if (n.chatId) return `/messages/${n.chatId}`
    return '/notifications'
  }

  async function handleNotifClick(n: Notification) {
    if (!n.isRead) await markNotifRead(n.id)
    notifPopoverOpen = false
    goto(notifLink(n))
  }

  function notifIconFor(type: string): typeof Briefcase {
    if (type.startsWith('ORDER_')) return Briefcase
    if (type.startsWith('PROPOSAL_') || type === 'NEW_PROPOSAL')
      return MessageSquare
    return Bell
  }

  function formatRelativeShort(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr = Math.floor(diffMin / 60)
    const diffDays = Math.floor(diffHr / 24)
    if (diffMin < 1) return 'щойно'
    if (diffMin < 60) return `${diffMin} хв`
    if (diffHr < 24) return `${diffHr} год`
    return `${diffDays} д`
  }

  function formatBadge(n: number): string {
    return n > 99 ? '99+' : String(n)
  }

  // ─── Lifecycle ───
  onMount(() => {
    if (!session?.user?.id) return

    initChats() // синхронно — данные уже есть
    setupNotifListener()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        invalidate('app:badges')
        invalidate('app:chats') // ← обновим и чаты
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
    }
  })

  onDestroy(() => {
    if (notifChannel) {
      try {
        notifChannel.unbind('notification:new')
      } catch {}
    }
  })

  $effect(() => {
    if (notifPopoverOpen && !notifInitialized) {
      loadNotifications()
    }
  })

  async function handleSignOut() {
    if (notifChannel) {
      try {
        notifChannel.unbind('notification:new')
      } catch {}
    }
    chatStore.unsubscribeAll()
    disconnectPusher()
    await signOut()
    await invalidateAll()
    goto('/')
  }
</script>

<div class="flex items-center gap-1 shrink-0">
  {#if !isLoggedIn}
    <button
      type="button"
      onclick={() => onnavigate('/user/login')}
      class="hidden sm:flex items-center h-8 px-3 rounded-full text-[13px] font-normal cursor-pointer text-white/80 hover:text-white hover:bg-white/8 transition-colors"
    >
      Увійти
    </button>
    <button
      type="button"
      onclick={() => onnavigate('/user/register')}
      class="flex items-center h-8 px-4 rounded-full text-[13px] font-medium cursor-pointer bg-white text-black hover:bg-white/90 transition-colors"
    >
      Реєстрація
    </button>
  {:else}
    <a
      href="/jobs"
      class="relative flex items-center justify-center h-9 w-9 rounded-full cursor-pointer text-white/75 hover:text-white hover:bg-white/8 transition-colors"
      aria-label="Замовлення"
    >
      <ClipboardList class="size-5" strokeWidth={1.75} />
    </a>

    <!-- Messages -->
    <button
      type="button"
      onclick={() => onnavigate('/messages')}
      class="relative flex items-center justify-center h-9 w-9 rounded-full cursor-pointer text-white/75 hover:text-white hover:bg-white/8 transition-colors"
      aria-label="Повідомлення"
    >
      <MessageCircle class="size-5" strokeWidth={1.75} />
      {#if messageCount > 0}
        <span
          class="absolute top-0.5 right-0.5 min-w-[16px] h-4 text-[10px] font-bold rounded-full flex items-center justify-center px-1 bg-white text-black"
        >
          {formatBadge(messageCount)}
        </span>
      {/if}
    </button>

    <!-- Notifications -->
    <Popover.Root bind:open={notifPopoverOpen}>
   <Popover.Trigger>
  {#snippet child({ props })}
    <button
      {...props}
      type="button"
      class="relative flex items-center justify-center h-9 w-9 rounded-full cursor-pointer text-white/75 hover:text-white hover:bg-white/8 transition-colors"
      aria-label="Сповіщення"
    >
      <Bell class="size-5" strokeWidth={1.75} />
      {#if notifUnreadCount > 0}
        <span
          class="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 text-[10px] font-semibold rounded-full flex items-center justify-center bg-red-500 text-white tabular-nums"
        >
          {formatBadge(notifUnreadCount)}
        </span>
      {/if}
    </button>
  {/snippet}
</Popover.Trigger>

      <Popover.Content
        class="w-[360px] p-0 overflow-hidden rounded-xl border shadow-xl"
        align="end"
        sideOffset={10}
        style="border-color: var(--border); background-color: var(--popover, var(--background))"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between px-4 h-12"
          style="border-bottom: 1px solid var(--border)"
        >
          <div class="flex items-center gap-2">
            <h3
              class="text-[13px] font-semibold tracking-tight"
              style="color: var(--foreground)"
            >
              Сповіщення
            </h3>
            {#if notifUnreadCount > 0}
              <span
                class="text-[11px] font-medium px-1.5 py-0.5 rounded-md"
                style="background-color: var(--muted); color: var(--muted-foreground)"
              >
                {notifUnreadCount}
              </span>
            {/if}
          </div>
          {#if notifUnreadCount > 0}
            <button
              type="button"
              onclick={markAllNotifRead}
              class="text-[12px] font-medium cursor-pointer transition-opacity hover:opacity-70"
              style="color: var(--muted-foreground)"
            >
              Прочитати все
            </button>
          {/if}
        </div>

        <!-- List -->
        <div class="max-h-[420px] overflow-y-auto">
          {#if !notifInitialized && notifLoading}
            <div class="py-16 flex items-center justify-center">
              <div
                class="size-4 rounded-full border-2 animate-spin"
                style="border-color: var(--border); border-top-color: var(--foreground)"
              ></div>
            </div>
          {:else if notifications.length === 0}
            <div class="py-16 px-6 text-center">
              <div
                class="size-10 mx-auto mb-3 rounded-full flex items-center justify-center"
                style="background-color: var(--muted)"
              >
                <Bell
                  class="size-4"
                  strokeWidth={1.75}
                  style="color: var(--muted-foreground)"
                />
              </div>
              <p
                class="text-[13px] font-medium"
                style="color: var(--foreground)"
              >
                Поки що тихо
              </p>
              <p
                class="text-[12px] mt-1"
                style="color: var(--muted-foreground)"
              >
                Нові сповіщення зʼявляться тут
              </p>
            </div>
          {:else}
            <div class="py-1">
              {#each notifications as n (n.id)}
                {@const Icon = notifIconFor(n.type)}
                <button
                  type="button"
                  onclick={() => handleNotifClick(n)}
                  class="group w-full flex items-start gap-3 px-4 py-3 text-left cursor-pointer transition-colors hover:bg-[var(--accent)] relative"
                >
                  {#if !n.isRead}
                    <span
                      class="absolute left-1.5 top-1/2 -translate-y-1/2 size-1.5 rounded-full"
                      style="background-color: var(--primary)"
                    ></span>
                  {/if}

                  <div
                    class="size-8 rounded-full shrink-0 flex items-center justify-center transition-colors"
                    style="background-color: var(--muted)"
                  >
                    <Icon
                      class="size-[15px]"
                      strokeWidth={1.75}
                      style="color: var(--foreground)"
                    />
                  </div>

                  <div class="flex-1 min-w-0 pt-px">
                    <div class="flex items-baseline gap-2">
                      <p
                        class="text-[13px] leading-snug truncate flex-1 {n.isRead
                          ? 'font-normal'
                          : 'font-semibold'}"
                        style="color: var(--foreground)"
                      >
                        {n.title}
                      </p>
                      <span
                        class="text-[11px] shrink-0 tabular-nums"
                        style="color: var(--muted-foreground)"
                      >
                        {formatRelativeShort(n.createdAt)}
                      </span>
                    </div>
                    {#if n.body}
                      <p
                        class="text-[12px] mt-0.5 leading-snug line-clamp-1"
                        style="color: var(--muted-foreground)"
                      >
                        {n.body}
                      </p>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Footer -->
        {#if notifications.length > 0}
          <div
            class="h-10 flex items-center justify-center"
            style="border-top: 1px solid var(--border); background-color: var(--muted)"
          >
            <a
              href="/notifications"
              onclick={() => (notifPopoverOpen = false)}
              class="text-[12px] font-medium transition-opacity hover:opacity-70"
              style="color: var(--foreground)"
            >
              Усі сповіщення
            </a>
          </div>
        {/if}
      </Popover.Content>
    </Popover.Root>

    <!-- User dropdown -->
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            type="button"
            class="flex items-center justify-center h-9 w-9 rounded-full cursor-pointer hover:bg-white/8 transition-colors"
            aria-label="Меню профілю"
          >
            {#if user?.avatar}
              <Avatar class="size-7">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback
                  class="text-[9px] font-semibold bg-white/12 text-white"
                >
                  {user.initials}
                </AvatarFallback>
              </Avatar>
            {:else}
              <CircleUserRound
                class="size-5 text-white/75"
                strokeWidth={1.75}
              />
            {/if}
          </button>
        {/snippet}
      </DropdownMenu.Trigger>

      <DropdownMenu.Content class="w-56 mt-2" align="end">
        <div class="px-3 py-3 flex items-center gap-2.5">
          <Avatar class="size-9 shrink-0">
            <AvatarImage src={user?.avatar ?? ''} alt={user?.name ?? ''} />
            <AvatarFallback class="text-xs font-semibold"
              >{user?.initials ?? 'U'}</AvatarFallback
            >
          </Avatar>
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">{user?.name}</p>
            <p class="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <DropdownMenu.Separator />
        <DropdownMenu.Group>
          <DropdownMenu.Item
            class="gap-2 cursor-pointer"
            onclick={() => goto('/dashboard')}
          >
            <User class="size-3.5 text-muted-foreground" /><span
              >Мій профіль</span
            >
          </DropdownMenu.Item>
          <DropdownMenu.Item
            class="gap-2 cursor-pointer"
            onclick={() => onnavigate('/messages')}
          >
            <MessageSquare class="size-3.5 text-muted-foreground" /><span
              >Повідомлення</span
            >
            {#if messageCount > 0}
              <span
                class="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style="background-color: var(--foreground); color: var(--background)"
              >
                {messageCount}
              </span>
            {/if}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            class="gap-2 cursor-pointer"
            onclick={() => goto('/orders')}
          >
            <Briefcase class="size-3.5 text-muted-foreground" /><span
              >Замовлення</span
            >
          </DropdownMenu.Item>
          <DropdownMenu.Item
            class="gap-2 cursor-pointer"
            onclick={() => goto('/settings')}
          >
            <Settings class="size-3.5 text-muted-foreground" /><span
              >Налаштування</span
            >
          </DropdownMenu.Item>
        </DropdownMenu.Group>
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          class="gap-2 cursor-pointer text-destructive focus:text-destructive"
          onclick={handleSignOut}
        >
          <LogOut class="size-3.5" /><span>Вийти</span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  {/if}
</div>
