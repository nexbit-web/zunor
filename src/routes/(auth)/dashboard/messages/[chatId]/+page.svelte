<script lang="ts">
  import { onMount } from 'svelte'
  import * as Resizable from '$lib/components/ui/resizable'
  import ChatListSidebar from '$lib/components/chat/chat-list-sidebar.svelte'
  import ChatWindow from '$lib/components/chat/chat-window.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  // ─── Resizable sidebar — ширина у localStorage ───
  let initialSize = $state(28)
  const SIZE_KEY = 'zunor-chat-sidebar-size'
  const LAST_CHAT_KEY = 'zunor-last-chat-id'
  const MIN_SIZE = 20
  const MAX_SIZE = 45

  onMount(() => {
    const saved = localStorage.getItem(SIZE_KEY)
    if (saved) {
      const n = Number(saved)
      if (!isNaN(n) && n >= MIN_SIZE && n <= MAX_SIZE) {
        initialSize = n
      }
    }
  })

  function saveSize(size: number) {
    localStorage.setItem(SIZE_KEY, String(size))
  }

  // ─── Запам'ятовуємо поточний chatId для авто-redirect при наступному заході ───
  $effect(() => {
    const id = data.chat.id
    if (typeof window !== 'undefined' && id) {
      localStorage.setItem(LAST_CHAT_KEY, id)
    }
  })
</script>

<svelte:head>
  <title>{data.chat.peer.name} · Zunor</title>
</svelte:head>

<!-- На мобільному — лише вікно чату, на десктопі — resizable split -->
<div class="h-full md:hidden">
  <ChatWindow
    chatId={data.chat.id}
    chat={data.chat}
    initialMessages={data.initialMessages}
    initialNextCursor={data.initialNextCursor}
    currentUserId={data.currentUserId}
    currentUserRole={data.currentUserRole ?? undefined}
  />
</div>

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
      <!-- Без відступів: сайдбар і чат — одна поверхня, розділена лінією,
           а не дві картки, що плавають над шпалерами. -->
      <div class="h-full border-r border-border/60">
        <ChatListSidebar
          activeChatId={data.chat.id}
          currentUserId={data.currentUserId}
        />
      </div>
    </Resizable.Pane>

    <Resizable.Handle withHandle={false} class="w-0 bg-transparent" />

    <Resizable.Pane defaultSize={100 - initialSize}>
      <ChatWindow
        chatId={data.chat.id}
        chat={data.chat}
        initialMessages={data.initialMessages}
        initialNextCursor={data.initialNextCursor}
        currentUserId={data.currentUserId}
        currentUserRole={data.currentUserRole ?? undefined}
      />
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>
