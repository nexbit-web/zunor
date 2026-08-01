<!-- src/lib/components/chat/chat-list-sidebar.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { BadgeCheck, MessageSquare, Search, X } from 'lucide-svelte'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import type { ChatPreview } from './types'

  interface Props {
    activeChatId?: string | null
    currentUserId: string
  }

  let { activeChatId = null, currentUserId }: Props = $props()

  type Tab = 'all' | 'unread'

  let search = $state('')
  let tab = $state<Tab>('all')

  const chats = $derived(chatStore.chats)
  const unreadTotal = $derived(chats.filter((c) => c.unreadCount > 0).length)

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase()
    return chats.filter((c) => {
      if (tab === 'unread' && c.unreadCount === 0) return false
      if (!q) return true
      return (
        c.peer.name.toLowerCase().includes(q) ||
        (c.peer.username?.toLowerCase().includes(q) ?? false)
      )
    })
  })

  /**
   * Класи для іконки верифікації.
   * Функція, а не class:-директива: на компонентах Svelte директиви заборонені
   * (component_invalid_directive), тому колір передаємо готовим рядком.
   */
  function badgeClass(isActive: boolean): string {
    return isActive
      ? 'size-4 shrink-0 fill-primary-foreground text-primary'
      : 'size-4 shrink-0 fill-primary text-primary-foreground'
  }

  function formatTime(iso: string | null): string {
    if (!iso) return ''

    const date = new Date(iso)
    const diffMin = Math.floor((Date.now() - date.getTime()) / 60000)
    if (diffMin < 1) return 'щойно'
    if (diffMin < 60) return `${diffMin} хв`

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(date)
    target.setHours(0, 0, 0, 0)

    if (target.getTime() === today.getTime()) {
      return date.toLocaleTimeString('uk-UA', {
        hour: '2-digit',
        minute: '2-digit',
      })
    }

    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (target.getTime() === yesterday.getTime()) return 'вчора'

    const days = (today.getTime() - target.getTime()) / 86_400_000
    if (days < 7) {
      return date
        .toLocaleDateString('uk-UA', { weekday: 'short' })
        .replace('.', '')
    }

    return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
  }

  function previewLabel(c: ChatPreview): string {
    if (!c.lastMessageText) return 'Чат створено'
    return c.lastSenderId === currentUserId
      ? `Ви: ${c.lastMessageText}`
      : c.lastMessageText
  }
</script>

<!-- Мобільний: на всю ширину, без кутів і тіні.
     З sm: плаваюча картка, щоб було видно градієнт сторінки. -->
<div
  class="flex h-full flex-col overflow-hidden bg-card sm:rounded-3xl sm:shadow-sm"
>
  <!-- ─── ПОШУК ─── -->
  <!-- pt-[max(...)] — щоб на iPhone поле не залазило під «чубчик» -->
  <div class="shrink-0 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
    <div class="relative">
      <Search
        class="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="text"
        bind:value={search}
        placeholder="Пошук"
        aria-label="Пошук чату"
        class="h-11 w-full rounded-full bg-muted pr-10 pl-11 text-[16px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:text-[15px]"
      />
      {#if search}
        <button
          type="button"
          onclick={() => (search = '')}
          class="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
          aria-label="Очистити пошук"
        >
          <X class="size-4" />
        </button>
      {/if}
    </div>
  </div>

  <!-- ─── ТАБИ ─── -->
  <div class="shrink-0 px-3 pb-2">
    <div class="flex gap-1 rounded-full bg-muted p-1" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'all'}
        onclick={() => (tab = 'all')}
        class="flex-1 cursor-pointer rounded-full py-2 text-[14px] font-medium transition-colors"
        class:bg-card={tab === 'all'}
        class:text-primary={tab === 'all'}
        class:shadow-sm={tab === 'all'}
        class:text-muted-foreground={tab !== 'all'}
      >
        Всі
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'unread'}
        onclick={() => (tab = 'unread')}
        class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full py-2 text-[14px] font-medium transition-colors"
        class:bg-card={tab === 'unread'}
        class:text-primary={tab === 'unread'}
        class:shadow-sm={tab === 'unread'}
        class:text-muted-foreground={tab !== 'unread'}
      >
        Непрочитані
        {#if unreadTotal > 0}
          <span
            class="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground"
          >
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        {/if}
      </button>
    </div>
  </div>

  <!-- ─── СПИСОК ─── -->
  <!-- pb на мобільному враховує домашню смужку iPhone -->
  <div
    class="chat-scroll flex-1 overflow-y-auto px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
  >
    {#if !chatStore.initialized}
      <div class="space-y-1">
        {#each Array(7) as _, i (i)}
          <div class="flex items-center gap-3 px-2.5 py-2.5">
            <div
              class="size-13 shrink-0 animate-pulse rounded-full bg-muted"
            ></div>
            <div class="flex-1 space-y-2">
              <div class="h-3.5 w-2/3 animate-pulse rounded bg-muted"></div>
              <div class="h-3 w-1/2 animate-pulse rounded bg-muted"></div>
            </div>
          </div>
        {/each}
      </div>
    {:else if filtered.length === 0}
      <div
        class="flex h-full flex-col items-center justify-center px-6 py-12 text-center"
      >
        <div
          class="mb-3 flex size-12 items-center justify-center rounded-full bg-muted"
        >
          <MessageSquare class="size-5 text-muted-foreground" />
        </div>
        <p class="mb-1 text-sm font-medium">
          {search
            ? 'Нічого не знайдено'
            : tab === 'unread'
              ? 'Непрочитаних немає'
              : 'Немає чатів'}
        </p>
        <p class="text-xs text-muted-foreground">
          {search
            ? 'Спробуйте інший запит'
            : tab === 'unread'
              ? 'Ви все прочитали'
              : 'Знайдіть майстра і напишіть йому'}
        </p>
      </div>
    {:else}
      <div class="flex flex-col gap-0.5">
        {#each filtered as chat (chat.id)}
          {@const isActive = chat.id === activeChatId}
          {@const hasUnread = chat.unreadCount > 0}
          <button
            type="button"
            onclick={() => goto(`/dashboard/messages/${chat.id}`)}
            aria-current={isActive ? 'page' : undefined}
            class="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors"
            class:bg-primary={isActive}
            class:text-primary-foreground={isActive}
            class:hover:bg-muted={!isActive}
          >
            <Avatar class="size-13 shrink-0">
              <AvatarImage src={chat.peer.avatar ?? ''} alt={chat.peer.name} />
              <AvatarFallback
                class="bg-muted text-[15px] font-semibold text-foreground"
              >
                {chat.peer.name?.[0]?.toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>

            <div class="min-w-0 flex-1">
              <!-- Верхній рядок: імʼя · час -->
              <div class="mb-0.5 flex items-baseline justify-between gap-2">
                <div class="flex min-w-0 items-center gap-1">
                  <p class="truncate text-[15px] font-semibold">
                    {chat.peer.name}
                  </p>
                  {#if chat.peer.isVerified}
                    <BadgeCheck class={badgeClass(isActive)} />
                  {/if}
                </div>
                <span
                  class="shrink-0 text-[12px] tabular-nums"
                  class:opacity-80={isActive}
                  class:text-muted-foreground={!isActive}
                >
                  {formatTime(chat.lastMessageAt)}
                </span>
              </div>

              <!-- Нижній рядок: превʼю · лічильник -->
              <div class="flex items-center justify-between gap-2">
                <p
                  class="truncate text-[13.5px] leading-snug"
                  class:opacity-80={isActive}
                  class:font-medium={hasUnread && !isActive}
                  class:text-foreground={hasUnread && !isActive}
                  class:text-muted-foreground={!hasUnread && !isActive}
                >
                  {previewLabel(chat)}
                </p>
                {#if hasUnread}
                  <span
                    class="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums"
                    class:bg-primary-foreground={isActive}
                    class:text-primary={isActive}
                    class:bg-primary={!isActive}
                    class:text-primary-foreground={!isActive}
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

<style>
  /* Тонка смужка, як у стрічці повідомлень */
  .chat-scroll {
    scrollbar-width: thin;
    scrollbar-color: rgb(0 0 0 / 0.18) transparent;
  }

  .chat-scroll::-webkit-scrollbar {
    width: 6px;
  }

  .chat-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .chat-scroll::-webkit-scrollbar-thumb {
    background-color: rgb(0 0 0 / 0.18);
    border-radius: 9999px;
  }

  .chat-scroll::-webkit-scrollbar-thumb:hover {
    background-color: rgb(0 0 0 / 0.3);
  }

  :global(.dark) .chat-scroll {
    scrollbar-color: rgb(255 255 255 / 0.2) transparent;
  }

  :global(.dark) .chat-scroll::-webkit-scrollbar-thumb {
    background-color: rgb(255 255 255 / 0.2);
  }

  :global(.dark) .chat-scroll::-webkit-scrollbar-thumb:hover {
    background-color: rgb(255 255 255 / 0.35);
  }
</style>