<!-- src/lib/components/chat/chat-window.svelte -->
<script lang="ts">
  import { tick, untrack } from 'svelte'
  import { goto } from '$app/navigation'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import {
    BadgeCheck,
    ChevronLeft,
    Volume2,
    VolumeX,
    Search,
    X,
    ArrowUp,
    ArrowDown,
    Briefcase,
  } from 'lucide-svelte'
  import { getPusher } from '$lib/pusher-client'
  import {
    playMessageSound,
    playSentSound,
    isMuted,
    setMuted,
    unlockAudio,
  } from '$lib/sound/notification'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import MessageBubble from './message-bubble.svelte'
  import MessageComposer from './message-composer.svelte'
  import HeaderTyping from './header-typing.svelte'
  import type {
    ChatMessage,
    ChatDetails,
    MessageNewPayload,
    MessageReadPayload,
    TypingPayload,
  } from './types'

  interface Props {
    chatId: string
    chat: ChatDetails
    initialMessages: ChatMessage[]
    initialNextCursor: string | null
    currentUserId: string
    /** Роль поточного юзера — потрібно для кнопки "Створити замовлення" */
    currentUserRole?: string
    /** Активне замовлення у цьому чаті (опційно) — для бейджа під шапкою */
    activeOrder?: {
      id: string
      title: string
      status: string
    } | null
  }

  let {
    chatId,
    chat,
    initialMessages,
    initialNextCursor,
    currentUserId,
    currentUserRole,
    activeOrder = null,
  }: Props = $props()

  let messages = $state<ChatMessage[]>([...initialMessages].reverse())
  let nextCursor = $state(initialNextCursor)
  let loadingMore = $state(false)
  let peerLastReadAt = $state<Date | null>(null)
  let typingPeer = $state<string | null>(null)
  let typingTimer: ReturnType<typeof setTimeout> | null = null
  let muted = $state(isMuted())
  let scrollContainer = $state<HTMLDivElement | undefined>(undefined)
  let replyTo = $state<ChatMessage | null>(null)
  let editing = $state<ChatMessage | null>(null)
  let error = $state('')
  let pendingIds = $state<Set<string>>(new Set())
  let failedIds = $state<Set<string>>(new Set())

  // ─── Search ───
  let searchOpen = $state(false)
  let searchQuery = $state('')
  let searchInput = $state<HTMLInputElement | undefined>(undefined)
  let currentMatchIdx = $state(0)

  const peer = $derived(chat.peer)

  // Знаходимо матчі (id повідомлень які містять searchQuery)
  const matchedIds = $derived.by(() => {
    if (!searchQuery.trim()) return [] as string[]
    const q = searchQuery.toLowerCase()
    return messages
      .filter(
        (m) =>
          !m.deletedAt &&
          m.type !== 'SYSTEM' &&
          m.text &&
          m.text.toLowerCase().includes(q),
      )
      .map((m) => m.id)
  })

  // Скрол до поточного матча
  $effect(() => {
    if (matchedIds.length === 0) return
    const id = matchedIds[currentMatchIdx]
    if (!id) return
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-message-id="${id}"]`,
      ) as HTMLElement | null
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  })

  let lastInitChatId = ''
  $effect(() => {
    const id = chatId
    if (id === lastInitChatId) return
    lastInitChatId = id

    untrack(() => {
      messages = [...initialMessages].reverse()
      nextCursor = initialNextCursor
      peerLastReadAt = chat.myLastReadAt ? new Date(chat.myLastReadAt) : null
      typingPeer = null
      replyTo = null
      editing = null
      error = ''
      pendingIds = new Set()
      failedIds = new Set()
      searchOpen = false
      searchQuery = ''
      currentMatchIdx = 0
    })
    tick().then(() => scrollToBottom('auto'))
  })

  $effect(() => {
    if (typeof window === 'undefined') return
    const id = chatId

    untrack(() => {
      chatStore.activeChatId = id
    })

    const pusher = getPusher()
    const channelName = `private-chat-${id}`
    const channel = pusher.subscribe(channelName)

    const onNew = (data: MessageNewPayload) => {
      if (data.message.senderId === currentUserId) return
      if (untrack(() => messages.some((m) => m.id === data.message.id))) return

      messages = [...messages, data.message]
      tick().then(() => {
        if (document.visibilityState === 'visible') {
          playMessageSound()
          markRead()
        }
        if (isNearBottom()) scrollToBottom()
      })
    }

    const onEdit = (data: {
      messageId: string
      text: string
      editedAt: string
    }) => {
      messages = messages.map((m) =>
        m.id === data.messageId
          ? { ...m, text: data.text, editedAt: data.editedAt }
          : m,
      )
    }

    const onDelete = (data: { messageId: string }) => {
      messages = messages.map((m) =>
        m.id === data.messageId
          ? { ...m, deletedAt: new Date().toISOString(), text: '' }
          : m,
      )
    }

    const onRead = (data: MessageReadPayload) => {
      if (data.readerId !== currentUserId) {
        peerLastReadAt = new Date(data.lastReadAt)
      }
    }

    const onTypingEvt = (data: TypingPayload) => {
      if (data.userId === currentUserId) return
      typingPeer = data.userName
      if (typingTimer) clearTimeout(typingTimer)
      typingTimer = setTimeout(() => (typingPeer = null), 3000)
    }

    channel.bind('message:new', onNew)
    channel.bind('message:edit', onEdit)
    channel.bind('message:delete', onDelete)
    channel.bind('message:read', onRead)
    channel.bind('client-typing', onTypingEvt)

    markRead()

    const onVis = () => {
      if (document.visibilityState === 'visible') markRead()
    }
    document.addEventListener('visibilitychange', onVis)
    document.addEventListener('click', unlockAudio, { once: true })

    return () => {
      channel.unbind_all()
      pusher.unsubscribe(channelName)
      document.removeEventListener('visibilitychange', onVis)
      if (typingTimer) {
        clearTimeout(typingTimer)
        typingTimer = null
      }
      untrack(() => {
        if (chatStore.activeChatId === id) chatStore.activeChatId = null
      })
    }
  })

  function handleSendOptimistic(msg: ChatMessage) {
    messages = [...messages, msg]
    pendingIds = new Set([...pendingIds, msg.id])
    tick().then(() => scrollToBottom())
  }

  function handleSendConfirmed(tmpId: string, real: ChatMessage) {
    const idx = messages.findIndex((m) => m.id === tmpId)
    if (idx === -1) {
      messages = [...messages, real]
    } else {
      messages = messages.map((m, i) => (i === idx ? real : m))
    }
    const newPending = new Set(pendingIds)
    newPending.delete(tmpId)
    pendingIds = newPending
    playSentSound()
  }

  function handleSendFailed(tmpId: string, errMsg: string) {
    if (!tmpId) {
      error = errMsg
      setTimeout(() => (error = ''), 4000)
      return
    }
    const newPending = new Set(pendingIds)
    newPending.delete(tmpId)
    pendingIds = newPending
    failedIds = new Set([...failedIds, tmpId])
    error = errMsg
    setTimeout(() => (error = ''), 5000)
  }

  function handleEdit(m: ChatMessage) {
    editing = m
    replyTo = null
  }

  function handleEditDone(updated: ChatMessage) {
    messages = messages.map((m) => (m.id === updated.id ? updated : m))
    editing = null
  }

  async function handleDelete(m: ChatMessage) {
    if (!confirm('Видалити це повідомлення?')) return
    // Optimistic
    const before = messages
    messages = messages.map((mm) =>
      mm.id === m.id
        ? { ...mm, deletedAt: new Date().toISOString(), text: '' }
        : mm,
    )
    try {
      const res = await fetch(`/api/chats/${chatId}/messages/${m.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Не вдалося видалити')
    } catch (err) {
      messages = before
      error = err instanceof Error ? err.message : 'Помилка'
      setTimeout(() => (error = ''), 4000)
    }
  }

  async function markRead() {
    untrack(() => chatStore.markChatRead(chatId))
    try {
      await fetch(`/api/chats/${chatId}/read`, { method: 'POST' })
    } catch {
      // ignore
    }
  }

  let lastTypingSent = 0
  function onTyping() {
    const now = Date.now()
    if (now - lastTypingSent < 2000) return
    lastTypingSent = now
    try {
      const pusher = getPusher()
      const channel = pusher.channel(`private-chat-${chatId}`)
      channel?.trigger('client-typing', {
        userId: currentUserId,
        userName: 'співрозмовник',
      })
    } catch {
      // Pusher може бути недоступний
    }
  }

  function isNearBottom(): boolean {
    if (!scrollContainer) return true
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer
    return scrollHeight - scrollTop - clientHeight < 200
  }

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    if (!scrollContainer) return
    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior,
    })
  }

  async function loadMore() {
    if (loadingMore || !nextCursor) return
    loadingMore = true
    const prevHeight = scrollContainer?.scrollHeight ?? 0
    try {
      const res = await fetch(
        `/api/chats/${chatId}/messages?cursor=${nextCursor}`,
      )
      if (!res.ok) return
      const json = await res.json()
      const older = (json.messages as ChatMessage[]).reverse()
      messages = [...older, ...messages]
      nextCursor = json.nextCursor
      await tick()
      if (scrollContainer) {
        const newHeight = scrollContainer.scrollHeight
        scrollContainer.scrollTop = newHeight - prevHeight
      }
    } finally {
      loadingMore = false
    }
  }

  function onScroll(e: Event) {
    const el = e.currentTarget as HTMLDivElement
    if (el.scrollTop < 100 && !loadingMore && nextCursor) loadMore()
  }

  function toggleMute() {
    muted = !muted
    setMuted(muted)
    if (!muted) unlockAudio()
  }

  function toggleSearch() {
    searchOpen = !searchOpen
    if (searchOpen) {
      tick().then(() => searchInput?.focus())
    } else {
      searchQuery = ''
      currentMatchIdx = 0
    }
  }

  function nextMatch() {
    if (matchedIds.length === 0) return
    currentMatchIdx = (currentMatchIdx + 1) % matchedIds.length
  }

  function prevMatch() {
    if (matchedIds.length === 0) return
    currentMatchIdx =
      (currentMatchIdx - 1 + matchedIds.length) % matchedIds.length
  }

  function onSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.shiftKey ? prevMatch() : nextMatch()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      toggleSearch()
    }
  }

  function isLastInGroup(idx: number): boolean {
    const m = messages[idx]
    const next = messages[idx + 1]
    if (!next) return true
    // SYSTEM повідомлення завжди рендерять як окремий блок
    if (m.type === 'SYSTEM' || next.type === 'SYSTEM') return true
    if (next.senderId !== m.senderId) return true
    const diff =
      new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime()
    return diff > 2 * 60 * 1000
  }

  function isReadByPeer(msg: ChatMessage): boolean {
    if (!peerLastReadAt) return false
    return new Date(msg.createdAt) <= peerLastReadAt
  }

  function shouldShowDateSeparator(idx: number): string | null {
    const m = messages[idx]
    const prev = messages[idx - 1]
    const date = new Date(m.createdAt)
    if (!prev) return formatDate(date)
    const prevDate = new Date(prev.createdAt)
    if (date.toDateString() !== prevDate.toDateString()) return formatDate(date)
    return null
  }

  function formatDate(d: Date): string {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const dDate = new Date(d)
    dDate.setHours(0, 0, 0, 0)

    if (dDate.getTime() === today.getTime()) return 'Сьогодні'
    if (dDate.getTime() === yesterday.getTime()) return 'Вчора'
    return d.toLocaleDateString('uk-UA', {
      day: 'numeric',
      month: 'long',
      year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    })
  }

  // ─── Active order helpers ───
  const orderStatusLabel = $derived.by(() => {
    if (!activeOrder) return null
    switch (activeOrder.status) {
      case 'CREATED':
        return 'Створено'
      case 'IN_PROGRESS':
        return 'У роботі'
      case 'COMPLETED':
        return 'Завершено'
      case 'CANCELLED':
        return 'Скасовано'
      default:
        return activeOrder.status
    }
  })

  const lastSeenLabel = $derived('був(ла) нещодавно')
</script>

<div class="flex flex-col h-full" style="background-color: var(--background)">
  <!-- ═══════ HEADER ═══════ -->
  <header
    class="flex items-center gap-3 px-4 h-[60px] shrink-0"
    style="border-bottom: 1px solid var(--border)"
  >
    <button
      type="button"
      onclick={() => goto('/messages')}
      class="size-9 rounded-full flex items-center justify-center cursor-pointer md:hidden"
      style="color: var(--muted-foreground)"
      aria-label="Назад"
    >
      <ChevronLeft class="size-5" />
    </button>

    <button
      type="button"
      onclick={() => peer.username && goto(`/@${peer.username}`)}
      class="flex items-center gap-3 min-w-0 flex-1 cursor-pointer text-left"
    >
      <Avatar class="size-9 shrink-0">
        <AvatarImage src={peer.avatar ?? ''} alt={peer.name} />
        <AvatarFallback
          class="text-xs font-semibold"
          style="background-color: var(--muted); color: var(--foreground)"
        >
          {peer.name?.[0]?.toUpperCase() ?? '?'}
        </AvatarFallback>
      </Avatar>
      <div class="min-w-0 flex flex-col justify-center">
        <div class="flex items-center gap-1">
          <p
            class="text-[14px] font-semibold truncate leading-tight"
            style="color: var(--foreground)"
          >
            {peer.name}
          </p>
          {#if peer.isVerified}
            <BadgeCheck
              class="size-3.5 shrink-0"
              style="color: var(--primary); fill: var(--primary); stroke: var(--primary-foreground)"
            />
          {/if}
        </div>
        <div class="leading-tight mt-0.5">
          {#if typingPeer}
            <HeaderTyping />
          {:else}
            <p
              class="text-[11px] truncate"
              style="color: var(--muted-foreground)"
            >
              {lastSeenLabel}
            </p>
          {/if}
        </div>
      </div>
    </button>

    <button
      type="button"
      onclick={toggleSearch}
      class="size-9 rounded-full flex items-center justify-center cursor-pointer transition-colors"
      style="background-color: {searchOpen ? 'var(--accent)' : 'transparent'};
             color: var(--muted-foreground)"
      aria-label="Пошук"
      onmouseenter={(e) => {
        if (!searchOpen)
          (e.currentTarget as HTMLElement).style.backgroundColor =
            'var(--muted)'
      }}
      onmouseleave={(e) => {
        if (!searchOpen)
          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
      }}
    >
      <Search class="size-4" />
    </button>

    <button
      type="button"
      onclick={toggleMute}
      class="size-9 rounded-full flex items-center justify-center cursor-pointer transition-colors"
      style="color: var(--muted-foreground)"
      aria-label={muted ? 'Увімкнути звук' : 'Вимкнути звук'}
      onmouseenter={(e) =>
        ((e.currentTarget as HTMLElement).style.backgroundColor =
          'var(--muted)')}
      onmouseleave={(e) =>
        ((e.currentTarget as HTMLElement).style.backgroundColor =
          'transparent')}
    >
      {#if muted}
        <VolumeX class="size-4" />
      {:else}
        <Volume2 class="size-4" />
      {/if}
    </button>
  </header>

  <!-- ═══════ ACTIVE ORDER BADGE ═══════ -->
  {#if activeOrder}
    <a
      href={`/orders/${activeOrder.id}`}
      class="flex items-center gap-2 px-4 py-2 shrink-0 transition-colors hover:opacity-90"
      style="background-color: var(--muted); border-bottom: 1px solid var(--border)"
    >
      <Briefcase
        class="size-3.5 shrink-0"
        style="color: var(--muted-foreground)"
      />
      <div class="flex-1 min-w-0">
        <p
          class="text-xs font-medium truncate"
          style="color: var(--foreground)"
        >
          Замовлення: {activeOrder.title}
        </p>
      </div>
      <span
        class="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded shrink-0"
        style="background-color: var(--background); color: var(--muted-foreground)"
      >
        {orderStatusLabel}
      </span>
    </a>
  {/if}

  <!-- ═══════ SEARCH BAR ═══════ -->
  {#if searchOpen}
    <div
      class="flex items-center gap-2 px-4 py-2 shrink-0"
      style="background-color: var(--muted); border-bottom: 1px solid var(--border)"
    >
      <Search class="size-4 shrink-0" style="color: var(--muted-foreground)" />
      <input
        bind:this={searchInput}
        bind:value={searchQuery}
        onkeydown={onSearchKeydown}
        type="text"
        placeholder="Пошук у цьому чаті"
        class="flex-1 min-w-0 bg-transparent outline-none text-[13px]"
        style="color: var(--foreground)"
      />
      {#if searchQuery}
        <span
          class="text-[11px] tabular-nums"
          style="color: var(--muted-foreground)"
        >
          {matchedIds.length === 0
            ? 'нічого'
            : `${currentMatchIdx + 1} / ${matchedIds.length}`}
        </span>
        <button
          type="button"
          onclick={prevMatch}
          disabled={matchedIds.length === 0}
          class="size-7 rounded-full flex items-center justify-center cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style="color: var(--muted-foreground)"
          aria-label="Попередній"
        >
          <ArrowUp class="size-3.5" />
        </button>
        <button
          type="button"
          onclick={nextMatch}
          disabled={matchedIds.length === 0}
          class="size-7 rounded-full flex items-center justify-center cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style="color: var(--muted-foreground)"
          aria-label="Наступний"
        >
          <ArrowDown class="size-3.5" />
        </button>
      {/if}
      <button
        type="button"
        onclick={toggleSearch}
        class="size-7 rounded-full flex items-center justify-center cursor-pointer"
        style="color: var(--muted-foreground)"
        aria-label="Закрити пошук"
      >
        <X class="size-3.5" />
      </button>
    </div>
  {/if}

  <!-- ═══════ MESSAGES ═══════ -->
  <div
    bind:this={scrollContainer}
    onscroll={onScroll}
    class="flex-1 overflow-y-auto"
    style="background-color: var(--background)"
  >
    <!-- Контейнер обмежує ширину на великих екранах -->
    <div class="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-1.5">
      {#if loadingMore}
        <div class="flex justify-center py-2">
          <div
            class="size-4 rounded-full border-2 border-t-transparent animate-spin"
            style="border-color: var(--muted-foreground); border-top-color: transparent"
          ></div>
        </div>
      {/if}

      {#if messages.length === 0}
        <div
          class="flex flex-col items-center justify-center py-20 text-center"
        >
          <Avatar class="size-14 mb-3">
            <AvatarImage src={peer.avatar ?? ''} alt={peer.name} />
            <AvatarFallback
              class="text-lg font-semibold"
              style="background-color: var(--muted); color: var(--foreground)"
            >
              {peer.name?.[0]?.toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
          <p class="text-[13px] font-medium" style="color: var(--foreground)">
            {peer.name}
          </p>
          <p class="text-xs mt-1" style="color: var(--muted-foreground)">
            Запропонувати роботу
          </p>
        </div>
      {:else}
        {#each messages as msg, idx (msg.id)}
          {@const dateLabel = shouldShowDateSeparator(idx)}
          {#if dateLabel}
            <div class="flex justify-center py-3">
              <span
                class="text-[11px] px-3 py-0.5 rounded-full"
                style="background-color: var(--muted); color: var(--muted-foreground)"
              >
                {dateLabel}
              </span>
            </div>
          {/if}
          <MessageBubble
            message={msg}
            isMine={msg.senderId === currentUserId}
            isLastInGroup={isLastInGroup(idx)}
            showReadStatus={msg.senderId === currentUserId &&
              idx === messages.length - 1}
            isRead={isReadByPeer(msg)}
            isPending={pendingIds.has(msg.id)}
            isFailed={failedIds.has(msg.id)}
            isHighlighted={searchQuery !== '' &&
              matchedIds[currentMatchIdx] === msg.id}
            onReply={(m) => {
              replyTo = m
              editing = null
            }}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        {/each}
      {/if}
    </div>
  </div>

  {#if error}
    <div
      class="px-4 py-2 text-xs text-center shrink-0"
      style="background-color: color-mix(in srgb, var(--destructive) 10%, transparent);
             color: var(--destructive)"
    >
      {error}
    </div>
  {/if}

  <!-- ═══════ COMPOSER (з обмеженням ширини) ═══════ -->
  <div class="shrink-0">
    <div class="max-w-3xl mx-auto">
      <MessageComposer
        {chatId}
        {currentUserId}
        {replyTo}
        {editing}
        onCancelReply={() => (replyTo = null)}
        onCancelEdit={() => (editing = null)}
        onSendOptimistic={handleSendOptimistic}
        onSendConfirmed={handleSendConfirmed}
        onSendFailed={handleSendFailed}
        onEditDone={handleEditDone}
        {onTyping}
      />
    </div>
  </div>
</div>
