<!-- src/lib/components/chat/chat-list-sidebar.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Badge } from '$lib/components/ui/badge'
  import { Input } from '$lib/components/ui/input'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import * as Tabs from '$lib/components/ui/tabs'
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

<!--
  Суцільна панель без власних кутів і тіні: сайдбар — частина того самого
  екрана, що й чат, а не картка, що «плаває» над шпалерами. Розділювач
  праворуч ставить сторінка.

  Фон — bg-background, той самий токен, що й у решти дашборда. bg-card тут
  був білою плитою поруч із рештою застосунку; картками в цьому екрані є
  рядки чатів і блоки чату, а не сама панель.
-->
<div class="flex h-full flex-col overflow-hidden bg-background">
  <!-- ─── ПОШУК ─── -->
  <!-- pt-[max(...)] — щоб на iPhone поле не залазило під «чубчик» -->
  <div class="shrink-0 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
    <div class="relative">
      <Search
        class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="text"
        bind:value={search}
        placeholder="Пошук чатів"
        aria-label="Пошук чату"
        class="h-9 rounded-full bg-muted pr-9 pl-9"
      />
      {#if search}
        <button
          type="button"
          onclick={() => (search = '')}
          class="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
          aria-label="Очистити пошук"
        >
          <X class="size-3.5" />
        </button>
      {/if}
    </div>
  </div>

  <!-- ─── ТАБИ ─── -->
  <!-- Tabs з ui замість двох кнопок із рукописними class:-модифікаторами. -->
  <div class="shrink-0 px-3 pb-2">
    <Tabs.Root
      value={tab}
      onValueChange={(v) => (tab = v as Tab)}
      class="w-full"
    >
      <Tabs.List class="w-full">
        <Tabs.Trigger value="all">Усі</Tabs.Trigger>
        <Tabs.Trigger value="unread">
          Непрочитані
          {#if unreadTotal > 0}
            <Badge variant="secondary" class="tabular-nums">
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </Badge>
          {/if}
        </Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  </div>

  <!-- ─── СПИСОК ─── -->
  <!-- pb на мобільному враховує домашню смужку iPhone -->
  <div
    class="flex-1 overflow-y-auto px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
  >
    {#if !chatStore.initialized}
      <div class="space-y-1">
        {#each Array.from({ length: 7 }), i (i)}
          <div class="flex items-center gap-3 px-2.5 py-2.5">
            <Skeleton class="size-10 shrink-0 rounded-full" />
            <div class="flex-1 space-y-2">
              <Skeleton class="h-3.5 w-2/3" />
              <Skeleton class="h-3 w-1/2" />
            </div>
          </div>
        {/each}
      </div>
    {:else if filtered.length === 0}
      <div
        class="flex h-full flex-col items-center justify-center px-6 py-12 text-center"
      >
        <MessageSquare
          class="mb-4 size-10 text-muted-foreground/70"
          strokeWidth={1}
        />
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
          <!-- Активний чат підсвічується приглушеним bg-muted.
               Раніше рядок заливався суцільним bg-primary, і через це
               довелось вести цілий набір інверсних кольорів для тексту,
               часу, галочки й лічильника — по class:-модифікатору на
               кожен. Приглушена підсвітка знімає всю цю арифметику. -->
          <button
            type="button"
            onclick={() => goto(`/dashboard/messages/${chat.id}`)}
            aria-current={isActive ? 'page' : undefined}
            class="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors {isActive
              ? 'bg-muted'
              : 'hover:bg-muted/50'}"
          >
            <Avatar class="size-10 shrink-0">
              <AvatarImage src={chat.peer.avatar ?? ''} alt="" />
              <AvatarFallback class="bg-muted text-sm font-semibold">
                {chat.peer.name?.[0]?.toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>

            <div class="min-w-0 flex-1">
              <!-- Верхній рядок: імʼя · час -->
              <div class="flex items-baseline justify-between gap-2">
                <div class="flex min-w-0 items-center gap-1">
                  <p class="truncate text-sm font-medium text-foreground">
                    {chat.peer.name}
                  </p>
                  {#if chat.peer.isVerified}
                    <BadgeCheck
                      class="size-3.5 shrink-0 fill-primary text-primary-foreground"
                    />
                  {/if}
                </div>
                <span
                  class="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                >
                  {formatTime(chat.lastMessageAt)}
                </span>
              </div>

              <!-- Нижній рядок: превʼю · лічильник -->
              <div class="mt-0.5 flex items-center justify-between gap-2">
                <p
                  class="truncate text-[13px] leading-snug {hasUnread
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground'}"
                >
                  {previewLabel(chat)}
                </p>
                {#if hasUnread}
                  <span
                    class="flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold tabular-nums text-primary-foreground"
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
