<!-- src/lib/components/chat/chat-window.svelte -->
<script lang="ts">
  import { tick, untrack } from 'svelte'
  import { goto } from '$app/navigation'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Button } from '$lib/components/ui/button'
  import {
    ArrowDown,
    ArrowUp,
    BadgeCheck,
    ChevronLeft,
    Search,
    Volume2,
    VolumeX,
    X,
  } from 'lucide-svelte'
  import { getPusher } from '$lib/pusher-client'
  import {
    isMuted,
    playMessageSound,
    playSentSound,
    setMuted,
    unlockAudio,
  } from '$lib/sound/notification'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import ChatBackground from './chat-background.svelte'
  import MessageBubble from './message-bubble.svelte'
  import MessageComposer from './message-composer.svelte'
  import HeaderTyping from './header-typing.svelte'
  import type {
    ChatDetails,
    ChatMessage,
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
    /** Роль поточного юзера — потрібна викликаючим сторінкам */
    currentUserRole?: string
  }

  let {
    chatId,
    chat,
    initialMessages,
    initialNextCursor,
    currentUserId,
    currentUserRole,
  }: Props = $props()

  // ═══════════════════════ Стан ═══════════════════════

  // untrack: пропси беремо як ПОЧАТКОВИЙ знімок і далі живемо своїм станом
  // (нові повідомлення приходять по Pusher). Перечитування при зміні чату
  // робить окремий $effect нижче — див. «Зміна чату».
  let messages = $state<ChatMessage[]>(
    untrack(() => [...initialMessages].reverse()),
  )
  let nextCursor = $state(untrack(() => initialNextCursor))
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

  // ─── Пошук ───
  let searchOpen = $state(false)
  let searchQuery = $state('')
  let searchInput = $state<HTMLInputElement | undefined>(undefined)
  let currentMatchIdx = $state(0)

  const peer = $derived(chat.peer)
  const lastSeenLabel = $derived('був(ла) нещодавно')

  /** id повідомлень, що містять searchQuery */
  const matchedIds = $derived.by(() => {
    if (!searchQuery.trim()) return [] as string[]
    const q = searchQuery.toLowerCase()
    return messages
      .filter((m) => !m.deletedAt && m.text && m.text.toLowerCase().includes(q))
      .map((m) => m.id)
  })

  // ═══════════════════════ Ефекти ═══════════════════════

  /** Скрол до поточного збігу пошуку */
  $effect(() => {
    if (matchedIds.length === 0) return
    const id = matchedIds[currentMatchIdx]
    if (!id) return
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-message-id="${id}"]`,
      )
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  })

  /** Зміна чату — скидаємо весь локальний стан */
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

  /** Realtime-підписка на канал чату */
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

  // ═══════════════════════ Надсилання ═══════════════════════

  function handleSendOptimistic(msg: ChatMessage) {
    messages = [...messages, msg]
    pendingIds = new Set([...pendingIds, msg.id])
    tick().then(() => scrollToBottom())
  }

  function handleSendConfirmed(tmpId: string, real: ChatMessage) {
    const idx = messages.findIndex((m) => m.id === tmpId)
    messages =
      idx === -1
        ? [...messages, real]
        : messages.map((m, i) => (i === idx ? real : m))

    const next = new Set(pendingIds)
    next.delete(tmpId)
    pendingIds = next
    playSentSound()
  }

  function handleSendFailed(tmpId: string, errMsg: string) {
    if (!tmpId) {
      showError(errMsg, 4000)
      return
    }
    const next = new Set(pendingIds)
    next.delete(tmpId)
    pendingIds = next
    failedIds = new Set([...failedIds, tmpId])
    showError(errMsg, 5000)
  }

  function showError(msg: string, ms: number) {
    error = msg
    setTimeout(() => (error = ''), ms)
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

    const snapshot = messages
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
      messages = snapshot // відкат оптимістичного видалення
      showError(err instanceof Error ? err.message : 'Помилка', 4000)
    }
  }

  async function markRead() {
    untrack(() => chatStore.markChatRead(chatId))
    try {
      await fetch(`/api/chats/${chatId}/read`, { method: 'POST' })
    } catch {
      // не критично: позначка оновиться при наступному відкритті
    }
  }

  let lastTypingSent = 0
  function onTyping() {
    const now = Date.now()
    if (now - lastTypingSent < 2000) return
    lastTypingSent = now
    try {
      getPusher().channel(`private-chat-${chatId}`)?.trigger('client-typing', {
        userId: currentUserId,
        userName: 'співрозмовник',
      })
    } catch {
      // Pusher може бути недоступний — індикатор друку не критичний
    }
  }

  // ═══════════════════════ Скрол і пагінація ═══════════════════════

  function isNearBottom(): boolean {
    if (!scrollContainer) return true
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer
    return scrollHeight - scrollTop - clientHeight < 200
  }

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    scrollContainer?.scrollTo({
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
      messages = [...(json.messages as ChatMessage[]).reverse(), ...messages]
      nextCursor = json.nextCursor

      // Утримуємо позицію: інакше стрічка стрибне до старих повідомлень
      await tick()
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight - prevHeight
      }
    } finally {
      loadingMore = false
    }
  }

  function onScroll(e: Event) {
    const el = e.currentTarget as HTMLDivElement
    if (el.scrollTop < 100 && !loadingMore && nextCursor) loadMore()
  }

  // ═══════════════════════ Пошук ═══════════════════════

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
      if (e.shiftKey) prevMatch()
      else nextMatch()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      toggleSearch()
    }
  }

  // ═══════════════════════ Групування ═══════════════════════

  function toggleMute() {
    muted = !muted
    setMuted(muted)
    if (!muted) unlockAudio()
  }

  /** Останнє в групі → пузир отримує хвостик */
  function isLastInGroup(idx: number): boolean {
    const m = messages[idx]
    const next = messages[idx + 1]
    if (!next) return true
    if (next.senderId !== m.senderId) return true
    const gap =
      new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime()
    return gap > 2 * 60 * 1000
  }

  function isReadByPeer(msg: ChatMessage): boolean {
    if (!peerLastReadAt) return false
    return new Date(msg.createdAt) <= peerLastReadAt
  }

  function replyAuthorName(msg: ChatMessage): string {
    if (!msg.replyTo) return ''
    return msg.replyTo.senderId === currentUserId ? 'Ви' : peer.name
  }

  function shouldShowDateSeparator(idx: number): string | null {
    const date = new Date(messages[idx].createdAt)
    const prev = messages[idx - 1]
    if (!prev) return formatDate(date)

    const prevDate = new Date(prev.createdAt)
    return date.toDateString() !== prevDate.toDateString()
      ? formatDate(date)
      : null
  }

  function formatDate(d: Date): string {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const target = new Date(d)
    target.setHours(0, 0, 0, 0)

    if (target.getTime() === today.getTime()) return 'Сьогодні'
    if (target.getTime() === yesterday.getTime()) return 'Вчора'

    return d.toLocaleDateString('uk-UA', {
      day: 'numeric',
      month: 'long',
      year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    })
  }
</script>

<!--
  Шпалери лежать під УСІМ вікном чату, а шапка, пошук і поле вводу
  «плавають» над ними скругленими блоками — тому візерунок видно і за
  ними, а не тільки в смузі між ними.

  Ширину всім трьом задає один і той самий max-w-3xl: стрічка, шапка й
  композер стоять однією колонкою по центру. Без цього на широкому
  моніторі рядок тексту розтягувався через увесь екран, і читати його
  доводилось поворотом голови.

  У лейауті розділу шпалер немає навмисно: там вони лежали ще й під
  списком чатів, і сайдбар просвічувався візерунком.
-->
<div
  class="relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-background"
>
  <ChatBackground />

  <!-- ═══════ HEADER ═══════ -->
  <div class="relative z-10 shrink-0 px-2 pt-2 sm:px-3 sm:pt-3">
    <header
      class="mx-auto flex h-15 w-full max-w-3xl min-w-0 items-center gap-1 rounded-2xl border border-border/60 bg-card/85 px-2 shadow-sm backdrop-blur-xl sm:px-3"
    >
      <button
        type="button"
        onclick={() => goto('/dashboard/messages')}
        class="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted md:hidden"
        aria-label="Назад до списку чатів"
      >
        <ChevronLeft class="size-5.5" />
      </button>

      <button
        type="button"
        onclick={() => peer.username && goto(`/@${peer.username}`)}
        class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-full text-left"
      >
        <Avatar class="size-9.5 shrink-0">
          <AvatarImage src={peer.avatar ?? ''} alt={peer.name} />
          <AvatarFallback class="bg-muted text-sm font-semibold">
            {peer.name?.[0]?.toUpperCase() ?? '?'}
          </AvatarFallback>
        </Avatar>

        <div class="flex min-w-0 flex-1 flex-col justify-center">
          <div class="flex min-w-0 items-center gap-1">
            <p class="truncate text-[15px] leading-tight font-semibold">
              {peer.name}
            </p>
            {#if peer.isVerified}
              <BadgeCheck class="size-4 shrink-0 fill-primary text-primary" />
            {/if}
          </div>
          <div class="mt-0.5 min-w-0 leading-tight">
            {#if typingPeer}
              <HeaderTyping />
            {:else}
              <p class="truncate text-[13px] text-muted-foreground">
                {lastSeenLabel}
              </p>
            {/if}
          </div>
        </div>
      </button>

      <Button
        variant="ghost"
        size="icon-lg"
        onclick={toggleSearch}
        aria-label="Пошук"
        aria-pressed={searchOpen}
        class="shrink-0 rounded-full text-muted-foreground {searchOpen
          ? 'bg-muted text-foreground'
          : ''}"
      >
        <Search class="size-5.25" />
      </Button>

      <Button
        variant="ghost"
        size="icon-lg"
        onclick={toggleMute}
        aria-label={muted ? 'Увімкнути звук' : 'Вимкнути звук'}
        class="shrink-0 rounded-full text-muted-foreground"
      >
        {#if muted}
          <VolumeX class="size-5.25" />
        {:else}
          <Volume2 class="size-5.25" />
        {/if}
      </Button>
    </header>
  </div>

  <!-- ═══════ SEARCH BAR ═══════ -->
  {#if searchOpen}
    <div class="relative z-10 shrink-0 px-2 pt-2 sm:px-3">
      <div
        class="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-2xl border border-border/60 bg-card/85 px-3 py-2 shadow-sm backdrop-blur-xl"
      >
        <Search class="size-4 shrink-0 text-muted-foreground" />
        <input
          bind:this={searchInput}
          bind:value={searchQuery}
          onkeydown={onSearchKeydown}
          type="text"
          placeholder="Пошук у цьому чаті"
          class="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
        />
        {#if searchQuery}
          <span class="text-[11px] tabular-nums text-muted-foreground">
            {matchedIds.length === 0
              ? 'нічого'
              : `${currentMatchIdx + 1} / ${matchedIds.length}`}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onclick={prevMatch}
            disabled={matchedIds.length === 0}
            aria-label="Попередній збіг"
            class="rounded-full text-muted-foreground"
          >
            <ArrowUp class="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onclick={nextMatch}
            disabled={matchedIds.length === 0}
            aria-label="Наступний збіг"
            class="rounded-full text-muted-foreground"
          >
            <ArrowDown class="size-3.5" />
          </Button>
        {/if}
        <Button
          variant="ghost"
          size="icon-sm"
          onclick={toggleSearch}
          aria-label="Закрити пошук"
          class="rounded-full text-muted-foreground"
        >
          <X class="size-3.5" />
        </Button>
      </div>
    </div>
  {/if}

  <!-- ═══════ MESSAGES ═══════ -->
  <div
    bind:this={scrollContainer}
    onscroll={onScroll}
    class="relative z-10 min-h-0 flex-1 overflow-y-auto"
  >
    <!-- Вертикальні відступи між пузирями задає сам MessageBubble. -->
    <div class="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4">
      {#if loadingMore}
        <div class="flex justify-center py-2">
          <div
            class="size-4 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-transparent"
          ></div>
        </div>
      {/if}

      {#if messages.length === 0}
        <div class="flex justify-center py-20">
          <div
            class="flex flex-col items-center rounded-3xl border border-border/60 bg-card/85 px-6 py-5 text-center shadow-sm backdrop-blur-xl"
          >
            <Avatar class="mb-3 size-14">
              <AvatarImage src={peer.avatar ?? ''} alt={peer.name} />
              <AvatarFallback class="text-lg font-semibold">
                {peer.name?.[0]?.toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>
            <p class="text-[13px] font-medium">{peer.name}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              Напишіть перше повідомлення
            </p>
          </div>
        </div>
      {:else}
        {#each messages as msg, idx (msg.id)}
          {@const dateLabel = shouldShowDateSeparator(idx)}
          {#if dateLabel}
            <div class="flex justify-center py-3">
              <span
                class="rounded-full border border-border/60 bg-card/85 px-3 py-0.5 text-[11px] text-muted-foreground backdrop-blur-sm"
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
            replyAuthorName={replyAuthorName(msg)}
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
    <div class="relative z-10 shrink-0 px-2 pt-2 sm:px-3">
      <div
        class="mx-auto w-full max-w-3xl rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-xs text-destructive backdrop-blur-xl"
        role="alert"
      >
        {error}
      </div>
    </div>
  {/if}

  <!-- ═══════ COMPOSER ═══════ -->
  <div class="relative z-10 shrink-0 px-2 pt-2 pb-2 sm:px-3 sm:pb-3">
    <div class="mx-auto w-full max-w-3xl">
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
