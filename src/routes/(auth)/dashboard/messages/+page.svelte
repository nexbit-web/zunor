<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import * as Resizable from '$lib/components/ui/resizable'
  import ChatListSidebar from '$lib/components/chat/chat-list-sidebar.svelte'
  import { MessageSquare } from 'lucide-svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  // ─── Resizable sidebar — ширина у localStorage ───
  let initialSize = $state(28)
  const SIZE_KEY = 'zunor-chat-sidebar-size'
  const LAST_CHAT_KEY = 'zunor-last-chat-id'
  const MIN_SIZE = 20
  const MAX_SIZE = 45

  onMount(() => {
    if (typeof window === 'undefined') return

    // Підвантажуємо ширину сайдбара
    const saved = localStorage.getItem(SIZE_KEY)
    if (saved) {
      const n = Number(saved)
      if (!isNaN(n) && n >= MIN_SIZE && n <= MAX_SIZE) {
        initialSize = n
      }
    }

    // ─── Авто-redirect на останній чат (тільки десктоп) ───
    // На мобільному не редіректимо — там список чатів = full-screen сторінка
    if (window.innerWidth < 768) return

    const lastId = localStorage.getItem(LAST_CHAT_KEY)
    if (!lastId) return

    const exists = data.chats.some((c) => c.id === lastId)
    if (exists) {
      goto(`/dashboard/messages/${lastId}`, { replaceState: true })
    } else {
      // Чат видалений / закритий — чистимо storage
      localStorage.removeItem(LAST_CHAT_KEY)
    }
  })

  function saveSize(size: number) {
    localStorage.setItem(SIZE_KEY, String(size))
  }
</script>

<svelte:head>
  <title>Повідомлення · Zunor</title>
</svelte:head>

<!-- Mobile: тільки список чатів full-screen -->
<div class="h-full md:hidden">
  <ChatListSidebar currentUserId={data.currentUserId} />
</div>

<!-- Desktop: resizable split з empty state -->
<div class="hidden h-full md:block">
  <Resizable.PaneGroup
    direction="horizontal"
    class="h-full"
    autoSaveId="zunor-chat-panes"
  >
    <Resizable.Pane
      defaultSize={initialSize}
      minSize={MIN_SIZE}
      maxSize={MAX_SIZE}
      onResize={saveSize}
    >
      <div class="h-full border-r border-border/60">
        <ChatListSidebar currentUserId={data.currentUserId} />
      </div>
    </Resizable.Pane>

    <Resizable.Handle withHandle={false} class="w-0 bg-transparent" />

    <Resizable.Pane defaultSize={100 - initialSize}>
      <!-- Порожній стан правої колонки: знак по центру, без підкладки. -->
      <div
        class="flex h-full flex-col items-center justify-center bg-background px-6 text-center"
      >
        <MessageSquare
          class="size-14 text-muted-foreground/70"
          strokeWidth={1}
        />
        <h2 class="mt-6 text-lg font-medium">Оберіть чат</h2>
        <p class="mt-2 max-w-70 text-sm leading-relaxed text-muted-foreground">
          Листування з клієнтами й майстрами — ліворуч.
        </p>
      </div>
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>
