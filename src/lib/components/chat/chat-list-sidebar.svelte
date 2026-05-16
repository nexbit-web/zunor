<!-- src/lib/components/chat/chat-list-sidebar.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import {
    Search,
    BadgeCheck,
    MessageSquare,
    ChevronLeft,
    X,
  } from 'lucide-svelte'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import type { ChatPreview } from './types'

  interface Props {
    activeChatId?: string | null
    currentUserId: string
  }

  let { activeChatId = null, currentUserId }: Props = $props()

  let search = $state('')

  const chats = $derived(chatStore.chats)

  const filtered = $derived(
    search.trim()
      ? chats.filter(
          (c) =>
            c.peer.name.toLowerCase().includes(search.toLowerCase()) ||
            (c.peer.username?.toLowerCase().includes(search.toLowerCase()) ??
              false),
        )
      : chats,
  )

  function formatTime(iso: string | null): string {
    if (!iso) return ''
    const date = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)

    if (diffMin < 1) return 'щойно'
    if (diffMin < 60) return `${diffMin} хв`

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dDate = new Date(date)
    dDate.setHours(0, 0, 0, 0)

    if (dDate.getTime() === today.getTime()) {
      return date.toLocaleTimeString('uk-UA', {
        hour: '2-digit',
        minute: '2-digit',
      })
    }
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (dDate.getTime() === yesterday.getTime()) return 'вчора'

    const diffDays = (today.getTime() - dDate.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays < 7) {
      return date
        .toLocaleDateString('uk-UA', { weekday: 'short' })
        .replace('.', '')
    }

    return date.toLocaleDateString('uk-UA', {
      day: 'numeric',
      month: 'short',
    })
  }

  function previewLabel(c: ChatPreview): string {
    if (!c.lastMessageText) return 'Чат створено'
    if (c.lastSenderId === currentUserId) return `Ви: ${c.lastMessageText}`
    return c.lastMessageText
  }
</script>

<div
  class="flex flex-col h-full overflow-hidden"
  style="background-color: var(--background);
         border-right: 1px solid var(--border)"
>
  <!-- ─── HEADER: стрілка назад + Zunor ─── -->
  <div class="px-3 pt-3 pb-2 shrink-0 flex items-center gap-2">
    <button
      type="button"
      onclick={() => goto('/')}
      class="size-9 rounded-full flex items-center justify-center cursor-pointer transition-colors shrink-0"
      style="color: var(--muted-foreground)"
      onmouseenter={(e) =>
        ((e.currentTarget as HTMLElement).style.backgroundColor =
          'var(--muted)')}
      onmouseleave={(e) =>
        ((e.currentTarget as HTMLElement).style.backgroundColor =
          'transparent')}
      aria-label="На головну"
    >
      <ChevronLeft class="size-5" />
    </button>

    <a
      href="/"
      class="text-[18px] font-bold tracking-tight cursor-pointer transition-opacity hover:opacity-70"
      style="color: var(--foreground); letter-spacing: -0.02em"
    >
      Zunor
    </a>
  </div>

  <!-- ─── SEARCH з хрестиком ─── -->
  <div class="px-3 pb-3 shrink-0">
    <div class="relative">
      <Search
        class="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
        style="color: var(--muted-foreground)"
      />
      <input
        type="text"
        bind:value={search}
        placeholder="Пошук"
        class="w-full h-9 pl-10 pr-9 rounded-full text-[13px] outline-none transition-colors"
        style="background-color: var(--muted);
               color: var(--foreground)"
      />
      {#if search}
        <button
          type="button"
          onclick={() => (search = '')}
          class="absolute right-1.5 top-1/2 -translate-y-1/2 size-6 rounded-full flex items-center justify-center cursor-pointer transition-colors"
          style="color: var(--muted-foreground)"
          aria-label="Очистити"
          onmouseenter={(e) =>
            ((e.currentTarget as HTMLElement).style.backgroundColor =
              'var(--accent)')}
          onmouseleave={(e) =>
            ((e.currentTarget as HTMLElement).style.backgroundColor =
              'transparent')}
        >
          <X class="size-3.5" />
        </button>
      {/if}
    </div>
  </div>

  <!-- ─── LIST ─── -->
  <div class="flex-1 overflow-y-auto pb-3">
    {#if !chatStore.initialized}
      <div class="px-2 space-y-1">
        {#each Array(6) as _}
          <div class="flex items-center gap-3 px-3 py-2.5">
            <div
              class="size-10 rounded-full animate-pulse"
              style="background-color: var(--muted)"
            ></div>
            <div class="flex-1 space-y-1.5">
              <div
                class="h-3 w-2/3 rounded animate-pulse"
                style="background-color: var(--muted)"
              ></div>
              <div
                class="h-3 w-1/2 rounded animate-pulse"
                style="background-color: var(--muted)"
              ></div>
            </div>
          </div>
        {/each}
      </div>
    {:else if filtered.length === 0}
      <div
        class="flex flex-col items-center justify-center h-full text-center px-6 py-12"
      >
        <div
          class="size-12 mb-3 rounded-full flex items-center justify-center"
          style="background-color: var(--muted)"
        >
          <MessageSquare class="size-5" style="color: var(--muted-foreground)" />
        </div>
        <p class="text-sm font-medium mb-1" style="color: var(--foreground)">
          {search ? 'Нічого не знайдено' : 'Немає чатів'}
        </p>
        <p class="text-xs" style="color: var(--muted-foreground)">
          {search ? 'Спробуйте інший запит' : 'Знайдіть майстра і напишіть йому'}
        </p>
      </div>
    {:else}
      <div class="flex flex-col gap-1 px-2">
        {#each filtered as chat (chat.id)}
          {@const isActive = chat.id === activeChatId}
          {@const hasUnread = chat.unreadCount > 0}
          <button
            type="button"
            onclick={() => goto(`/messages/${chat.id}`)}
            class="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left cursor-pointer transition-colors"
            style="background-color: {isActive ? 'var(--accent)' : 'transparent'}"
            onmouseenter={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLElement).style.backgroundColor =
                  'var(--muted)'
            }}
            onmouseleave={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLElement).style.backgroundColor =
                  'transparent'
            }}
          >
            <Avatar class="size-10 shrink-0">
              <AvatarImage src={chat.peer.avatar ?? ''} alt={chat.peer.name} />
              <AvatarFallback
                class="text-[13px] font-semibold"
                style="background-color: var(--muted); color: var(--foreground)"
              >
                {chat.peer.name?.[0]?.toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>

            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2 mb-0.5">
                <div class="flex items-center gap-1 min-w-0">
                  <p
                    class="text-[14px] font-semibold truncate"
                    style="color: var(--foreground)"
                  >
                    {chat.peer.name}
                  </p>
                  {#if chat.peer.isVerified}
                    <BadgeCheck
                      class="size-3.5 shrink-0"
                      style="color: var(--primary); fill: var(--primary); stroke: var(--primary-foreground)"
                    />
                  {/if}
                </div>
                <span
                  class="text-[11px] tabular-nums shrink-0"
                  style="color: var(--muted-foreground)"
                >
                  {formatTime(chat.lastMessageAt)}
                </span>
              </div>
              <div class="flex items-center justify-between gap-2">
                <p
                  class="text-[12.5px] truncate leading-snug"
                  style="color: {hasUnread
                    ? 'var(--foreground)'
                    : 'var(--muted-foreground)'};
                         font-weight: {hasUnread ? '500' : '400'}"
                >
                  {previewLabel(chat)}
                </p>
                {#if hasUnread}
                  <span
                    class="shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums"
                    style="background-color: var(--primary); color: var(--primary-foreground)"
                  >
                    {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                  </span>
                {/if}
              </div>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>