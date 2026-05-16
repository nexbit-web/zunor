<!-- src/routes/(auth)/messages/+page.svelte -->
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
      goto(`/messages/${lastId}`, { replaceState: true })
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
<div class="md:hidden h-full">
  <ChatListSidebar currentUserId={data.currentUserId} />
</div>

<!-- Desktop: resizable split з empty state -->
<div class="hidden md:block h-full">
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
      <ChatListSidebar currentUserId={data.currentUserId} />
    </Resizable.Pane>

    <Resizable.Handle withHandle={false} />

    <Resizable.Pane defaultSize={100 - initialSize}>
      <div
        class="h-full flex items-center justify-center"
        style="background-color: var(--background)"
      >
        <div class="text-center max-w-sm px-6">
          <div
            class="size-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style="background-color: var(--muted)"
          >
            <MessageSquare class="size-7" style="color: var(--muted-foreground)" />
          </div>
          <h2 class="text-xl font-semibold mb-2" style="color: var(--foreground)">
            Оберіть чат
          </h2>
          <p class="text-sm" style="color: var(--muted-foreground)">
            Виберіть розмову зі списку зліва або знайдіть майстра і напишіть
            йому перший раз.
          </p>
        </div>
      </div>
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>