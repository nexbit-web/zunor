<!--
  Вікно чату — месенджер, з якого не хочеться йти в Telegram.

  Що тут живе, крім стрічки й поля вводу:
  • реакції — ставляться оптимістично, правду приносить сервер
    (відповідь PUT і подія message:reaction з повним станом);
  • галочки ✓✓ — від lastReadAt СПІВРОЗМОВНИКА, на кожному своєму;
  • «у мережі / був(ла) 5 хв тому» — з presence, а щойно він пише чи
    друкує — одразу «у мережі»;
  • кнопка «вниз» із лічильником нових, поки читаєш історію;
  • межа «Непрочитані повідомлення» — чат відкривається на ній;
  • клік по цитаті — перехід до оригіналу (догружає історію, якщо треба);
  • пошук виїжджає в самій шапці, знайдене — списком під нею, як у
    Telegram Web; обране підсвічується, ↑/↓ — до сусіднього збігу;
  • фото — галереєю всього чату (PhotoSwipe), а не новою вкладкою.
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import { cubicOut } from 'svelte/easing'
  import { fade, fly, scale, slide } from 'svelte/transition'
  import { goto } from '$app/navigation'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Button } from '$lib/components/ui/button'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import BadgeCheck from '$lib/components/icons/set/badge-check.svelte'
  import ChevronDown from '$lib/components/icons/set/chevron-down.svelte'
  import ChevronUp from '$lib/components/icons/set/chevron-up.svelte'
  import ChevronLeft from '$lib/components/icons/set/chevron-left.svelte'
  import Search from '$lib/components/icons/set/search.svelte'
  import Volume2 from '$lib/components/icons/set/volume-2.svelte'
  import VolumeX from '$lib/components/icons/set/volume-x.svelte'
  import X from '$lib/components/icons/set/x.svelte'
  import { photoLightbox } from '$lib/utils/photo-lightbox'
  import { getPusher } from '$lib/pusher-client'
  import {
    isMuted,
    playMessageSound,
    playSentSound,
    setMuted,
    unlockAudio,
  } from '$lib/sound/notification'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { formatRelative } from '$lib/utils/time'
  import ChatBackground from './chat-background.svelte'
  import MessageBubble from './message-bubble.svelte'
  import MessageComposer from './message-composer.svelte'
  import SearchResults from './search-results.svelte'
  import { searchMessages } from './search'
  import HeaderTyping from './header-typing.svelte'
  import { applyReaction, nextReaction, type ReactionGroup } from './reactions'
  import type {
    ChatDetails,
    ChatMessage,
    LinkPreview,
    MessageEditPayload,
    MessageNewPayload,
    MessagePreviewPayload,
    MessageReactionPayload,
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
  }: Props = $props()

  /** Менше цього з останньої активності — «у мережі». */
  const ONLINE_MS = 5 * 60_000
  const DAY_MS = 24 * 60 * 60_000

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
  let peerSeenAt = $state<Date | null>(null)
  let typingPeer = $state<string | null>(null)
  let typingTimer: ReturnType<typeof setTimeout> | null = null
  let muted = $state(isMuted())
  let scrollContainer = $state<HTMLDivElement | undefined>(undefined)
  // Висоти шарів над стрічкою: шапка й низ (помилка + поле вводу). Стрічка
  // на всю висоту вікна, тож відступи в ній — саме ці числа. Стартові —
  // типові розміри, щоб до першого виміру стрічка не стрибала.
  let topH = $state(60)
  let bottomH = $state(68)
  let replyTo = $state<ChatMessage | null>(null)
  let editing = $state<ChatMessage | null>(null)
  let error = $state('')
  let pendingIds = $state<Set<string>>(new Set())
  let failedIds = $state<Set<string>>(new Set())

  /** Нові (не з історії) — тільки вони вʼїжджають анімацією. */
  let freshIds = $state<Set<string>>(new Set())
  /** Перше непрочитане на момент відкриття — над ним межа. */
  let unreadFromId = $state<string | null>(null)
  /** Сюди щойно перейшли з цитати — бульбашка спалахує. */
  let flashId = $state<string | null>(null)
  let flashTimer: ReturnType<typeof setTimeout> | null = null
  let deleteTarget = $state<ChatMessage | null>(null)

  /** Стрічка внизу? Ні — показуємо кнопку «вниз». */
  let atBottom = $state(true)
  /** Скільки нових прийшло, поки читали історію. */
  let unseen = $state(0)

  /** Годинник для «був(ла) 5 хв тому»: оновлюється сам, без запитів. */
  let now = $state(Date.now())

  // ─── Пошук ───
  let searchOpen = $state(false)
  let searchQuery = $state('')
  let searchInput = $state<HTMLInputElement | undefined>(undefined)
  /** Список знайденого розгорнутий під шапкою. */
  let resultsOpen = $state(false)
  /** Рядок списку під клавіатурою. */
  let searchCursor = $state(0)
  /** Обране в чаті: підсвічене, від нього ходять ↑/↓. */
  let activeMatchId = $state<string | null>(null)

  const peer = $derived(chat.peer)

  const isOnline = $derived(
    !!peerSeenAt && now - peerSeenAt.getTime() < ONLINE_MS,
  )
  const presenceLabel = $derived(
    !peerSeenAt
      ? 'був(ла) нещодавно'
      : isOnline
        ? 'у мережі'
        : `був(ла) ${formatRelative(peerSeenAt)}`,
  )

  /** Знайдене серед завантаженого — від найновішого. */
  const searchResults = $derived(searchMessages(messages, searchQuery))
  const activeIndex = $derived(
    searchResults.findIndex((m) => m.id === activeMatchId),
  )

  // ═══════════════════════ Ефекти ═══════════════════════

  onMount(() => {
    const clock = setInterval(() => (now = Date.now()), 30_000)

    // Галерея всіх фото чату: клік по будь-якому — гортаєш усі.
    const detachLightbox = scrollContainer
      ? photoLightbox(scrollContainer)
      : undefined

    return () => {
      clearInterval(clock)
      detachLightbox?.()
      if (flashTimer) clearTimeout(flashTimer)
    }
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
      peerLastReadAt = chat.peerLastReadAt
        ? new Date(chat.peerLastReadAt)
        : null
      peerSeenAt = chat.peerLastSeen ? new Date(chat.peerLastSeen) : null
      unreadFromId = firstUnreadId(messages, chat.myLastReadAt)
      typingPeer = null
      replyTo = null
      editing = null
      error = ''
      pendingIds = new Set()
      failedIds = new Set()
      freshIds = new Set()
      flashId = null
      deleteTarget = null
      unseen = 0
      atBottom = true
      searchOpen = false
      searchQuery = ''
      resultsOpen = false
      searchCursor = 0
      activeMatchId = null
    })

    // Є непрочитані — відкриваємо на межі, як Telegram, а не в самому
    // низу: інакше початок розмови, яку пропустив, лишався вище екрана.
    tick().then(() => {
      const divider = scrollContainer?.querySelector('[data-unread-divider]')
      if (divider) divider.scrollIntoView({ block: 'start' })
      else scrollToBottom('auto')
      updateAtBottom()
    })
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

      const wasAtBottom = isNearBottom()
      freshIds = new Set([...freshIds, data.message.id])
      messages = [
        ...messages,
        { ...data.message, reactions: data.message.reactions ?? [] },
      ]
      // Пише — отже в мережі просто зараз.
      peerSeenAt = new Date()
      typingPeer = null
      tick().then(() => {
        if (document.visibilityState === 'visible') {
          playMessageSound()
          markRead()
        }
        if (wasAtBottom) scrollToBottom()
        else unseen += 1
      })
    }

    const onEdit = (data: MessageEditPayload) => {
      messages = messages.map((m) =>
        m.id === data.messageId
          ? {
              ...m,
              text: data.text,
              editedAt: data.editedAt,
              linkPreview: data.linkPreview ?? null,
            }
          : m,
      )
    }

    const onDelete = (data: { messageId: string }) => {
      messages = messages.map((m) =>
        m.id === data.messageId
          ? {
              ...m,
              deletedAt: new Date().toISOString(),
              text: '',
              reactions: [],
              linkPreview: null,
            }
          : m,
      )
    }

    // Картка посилання дописується сервером після відправки — бульбашка
    // підростає, тож стрічку, що стояла внизу, тримаємо внизу.
    const onPreview = (data: MessagePreviewPayload) => {
      if (!untrack(() => messages.some((m) => m.id === data.messageId))) {
        // Своє ще з тимчасовим id: картка обігнала відповідь POST.
        earlyPreviews.set(data.messageId, data.linkPreview)
        if (earlyPreviews.size > 20) {
          earlyPreviews.delete(earlyPreviews.keys().next().value!)
        }
        return
      }
      const wasAtBottom = isNearBottom()
      setLinkPreview(data.messageId, data.linkPreview)
      if (wasAtBottom) tick().then(() => scrollToBottom())
    }

    const onRead = (data: MessageReadPayload) => {
      if (data.readerId !== currentUserId) {
        peerLastReadAt = new Date(data.lastReadAt)
        peerSeenAt = new Date()
        chatStore.markPeerRead(id, data.lastReadAt)
      }
    }

    // Повний стан реакцій — застосовуємо як є (і на свою зміну теж: це
    // підтвердження, а заразом лікує пропущені події).
    const onReaction = (data: MessageReactionPayload) => {
      setReactions(data.messageId, data.reactions)
    }

    const onTypingEvt = (data: TypingPayload) => {
      if (data.userId === currentUserId) return
      typingPeer = data.userName
      peerSeenAt = new Date()
      if (typingTimer) clearTimeout(typingTimer)
      typingTimer = setTimeout(() => (typingPeer = null), 3000)
    }

    channel.bind('message:new', onNew)
    channel.bind('message:edit', onEdit)
    channel.bind('message:delete', onDelete)
    channel.bind('message:read', onRead)
    channel.bind('message:reaction', onReaction)
    channel.bind('message:preview', onPreview)
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
    freshIds = new Set([...freshIds, msg.id])
    messages = [...messages, msg]
    pendingIds = new Set([...pendingIds, msg.id])
    // Своє — завжди донизу, навіть якщо читав історію.
    unreadFromId = null
    tick().then(() => scrollToBottom())
  }

  function handleSendConfirmed(tmpId: string, confirmed: ChatMessage) {
    const early = earlyPreviews.get(confirmed.id)
    earlyPreviews.delete(confirmed.id)
    const real = early ? { ...confirmed, linkPreview: early } : confirmed
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

  /** ↑ у порожньому полі — своє останнє, яке ще можна правити. */
  function editLast() {
    const last = [...messages]
      .reverse()
      .find(
        (m) =>
          m.senderId === currentUserId &&
          m.type === 'TEXT' &&
          !m.deletedAt &&
          !pendingIds.has(m.id) &&
          !failedIds.has(m.id) &&
          Date.now() - new Date(m.createdAt).getTime() < DAY_MS,
      )
    if (last) handleEdit(last)
  }

  function handleEditDone(updated: ChatMessage) {
    messages = messages.map((m) => (m.id === updated.id ? updated : m))
    editing = null
  }

  async function confirmDelete() {
    const m = deleteTarget
    deleteTarget = null
    if (!m) return

    const snapshot = messages
    messages = messages.map((mm) =>
      mm.id === m.id
        ? {
            ...mm,
            deletedAt: new Date().toISOString(),
            text: '',
            reactions: [],
            linkPreview: null,
          }
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

  // ═══════════════════════ Реакції ═══════════════════════

  function setReactions(messageId: string, reactions: ReactionGroup[]) {
    messages = messages.map((m) =>
      m.id === messageId ? { ...m, reactions } : m,
    )
  }

  // ═══════════════════════ Картки посилань ═══════════════════════

  /**
   * Картки, що прийшли раніше за підтвердження свого повідомлення (воно ще
   * під тимчасовим id). Не реактивне — читається лише в handleSendConfirmed.
   */
  const earlyPreviews = new Map<string, LinkPreview>()

  function setLinkPreview(messageId: string, linkPreview: LinkPreview) {
    messages = messages.map((m) =>
      m.id === messageId ? { ...m, linkPreview } : m,
    )
  }

  /**
   * Натиснули емодзі: та сама реакція — знімаємо, інша — ставимо замість.
   * Одразу показуємо результат, не вийшло — повертаємо як було.
   */
  async function handleReact(m: ChatMessage, emoji: string) {
    if (pendingIds.has(m.id) || failedIds.has(m.id) || m.deletedAt) return

    const before = messages.find((mm) => mm.id === m.id)?.reactions ?? []
    const next = nextReaction(before, currentUserId, emoji)
    setReactions(m.id, applyReaction(before, currentUserId, next))

    try {
      const res = await fetch(
        `/api/chats/${chatId}/messages/${m.id}/reaction`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji: next }),
        },
      )
      if (!res.ok) throw new Error()
      const json = (await res.json()) as { reactions: ReactionGroup[] }
      setReactions(m.id, json.reactions)
    } catch {
      setReactions(m.id, before)
      showError('Не вдалося поставити реакцію', 3000)
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
    const t = Date.now()
    if (t - lastTypingSent < 2000) return
    lastTypingSent = t
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

  function updateAtBottom() {
    atBottom = isNearBottom()
    if (atBottom) unseen = 0
  }

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    scrollContainer?.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior,
    })
  }

  // Поле вводу виросло (кілька рядків, відповідь, редагування) — стрічка
  // від цього не стає нижчою, росте лише її нижній відступ. Хто стояв
  // унизу, має там і лишитись, а не опинитись з останнім повідомленням
  // під полем вводу. Перший вимір після відкриття чату — той самий випадок.
  $effect(() => {
    void bottomH
    untrack(() => {
      if (atBottom) scrollToBottom('auto')
    })
  })

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
    updateAtBottom()
  }

  function messageEl(id: string): HTMLElement | null {
    return (
      scrollContainer?.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(id)}"]`,
      ) ?? null
    )
  }

  /**
   * Клік по цитаті. Оригінал може бути вище завантаженого — догружаємо
   * історію кілька сторінок, а не мовчимо.
   */
  async function jumpTo(id: string) {
    let el = messageEl(id)
    for (let i = 0; !el && nextCursor && i < 5; i++) {
      await loadMore()
      await tick()
      el = messageEl(id)
    }
    if (!el) {
      showError('Це повідомлення надто далеко в історії', 3000)
      return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    flashId = id
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => (flashId = null), 1500)
  }

  // ═══════════════════════ Пошук ═══════════════════════

  function openSearch() {
    searchOpen = true
    tick().then(() => searchInput?.focus())
  }

  function closeSearch() {
    searchOpen = false
    searchQuery = ''
    resultsOpen = false
    searchCursor = 0
    activeMatchId = null
  }

  /** Новий запит — новий список; обране з попереднього вже не про нього. */
  function onSearchInput() {
    resultsOpen = searchQuery.trim() !== ''
    searchCursor = 0
    activeMatchId = null
  }

  /** Повернутись до списку: клік у поле з уже набраним запитом. */
  function reopenResults() {
    if (searchQuery.trim()) resultsOpen = true
  }

  /** Обрали знайдене: список згортається, чат їде до повідомлення. */
  function selectMatch(id: string) {
    activeMatchId = id
    searchCursor = Math.max(
      0,
      searchResults.findIndex((m) => m.id === id),
    )
    resultsOpen = false
    jumpTo(id)
  }

  /** ↑ — до старішого збігу, ↓ — до новішого (список від найновішого). */
  function stepMatch(dir: 1 | -1) {
    if (searchResults.length === 0) return
    const next =
      activeIndex === -1
        ? 0
        : Math.min(searchResults.length - 1, Math.max(0, activeIndex + dir))
    selectMatch(searchResults[next].id)
  }

  function onSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      // Спершу згортаємо список (якщо вже щось обрано), потім — пошук.
      if (resultsOpen && activeMatchId) resultsOpen = false
      else closeSearch()
      return
    }

    if (resultsOpen && searchResults.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const last = searchResults.length - 1
        searchCursor =
          e.key === 'ArrowDown'
            ? Math.min(last, searchCursor + 1)
            : Math.max(0, searchCursor - 1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        selectMatch(searchResults[searchCursor].id)
      }
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      stepMatch(e.shiftKey ? -1 : 1)
    }
  }

  /** Фокус пішов із шапки (клік по стрічці) — список згортається. */
  function onHeaderFocusOut(e: FocusEvent) {
    const next = e.relatedTarget as Node | null
    if (!next || !(e.currentTarget as HTMLElement).contains(next)) {
      resultsOpen = false
    }
  }

  // ═══════════════════════ Групування ═══════════════════════

  function toggleMute() {
    muted = !muted
    setMuted(muted)
    if (!muted) unlockAudio()
  }

  /**
   * Перше непрочитане чуже повідомлення на момент відкриття. Чат ще ні
   * разу не відкривали (lastReadAt немає) — тоді за прапорцем isRead.
   */
  function firstUnreadId(
    list: ChatMessage[],
    myLastReadAt: string | null,
  ): string | null {
    const since = myLastReadAt ? new Date(myLastReadAt).getTime() : null
    return (
      list.find(
        (m) =>
          m.senderId !== currentUserId &&
          !m.deletedAt &&
          (since === null
            ? !m.isRead
            : new Date(m.createdAt).getTime() > since),
      )?.id ?? null
    )
  }

  /** Останнє в групі → пузир отримує хвостик */
  function isLastInGroup(idx: number): boolean {
    const m = messages[idx]
    const next = messages[idx + 1]
    if (!next) return true
    if (next.senderId !== m.senderId) return true
    if (next.id === unreadFromId) return true
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
  Шпалери (chat-background) лежать під УСІМ вікном чату, як у Telegram:
  на світлій темі — його зелений градієнт із візерунком, на темній —
  лише тихий візерунок. Шапка, пошук і поле вводу «плавають» над ними
  капсулами (повністю скруглені; поле вводу — у message-composer), тож
  візерунок видно і за ними, а не тільки в смузі між ними.

  У лейауті розділу шпалер немає навмисно: там вони лежали б ще й під
  списком чатів, і сайдбар просвічувався б візерунком.

  Ширину всім трьом задає одне число — 696px (max-w-174 у капсул,
  43.5rem у .chat-feed): стрічка, шапка й композер стоять однією
  колонкою по центру. Без цього на широкому
  моніторі рядок тексту розтягувався через увесь екран, і читати його
  доводилось поворотом голови.
-->
<div
  class="relative h-full w-full min-w-0 overflow-hidden bg-background"
  style:--chat-top="{topH}px"
  style:--chat-bottom="{bottomH}px"
>
  <ChatBackground />

  <!-- ═══════ MESSAGES ═══════
       Стрічка — на ВСЮ висоту вікна, як у Telegram: шапка й поле вводу
       лежать поверх неї, і повідомлення заїжджають під них, а не
       обрізаються рівною лінією. Щоб перше й останнє не ховались під
       капсулами, відступи стрічки дорівнюють їхній висоті (--chat-top,
       --chat-bottom — живі, бо поле вводу росте з текстом і відповіддю).
       Маска лише пригашує те, що заїхало під капсули, — без розмиття:
       розмитий текст під шапкою виглядав брудно. Шпалер вона не чіпає. -->
  <div
    bind:this={scrollContainer}
    onscroll={onScroll}
    class="chat-scroll absolute inset-0 z-10 overflow-x-hidden overflow-y-auto"
  >
    <!-- Вертикальні відступи між пузирями задає сам MessageBubble. -->
    <div class="chat-feed mx-auto">
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
        <!-- key: при зміні чату стрічка будується заново без анімацій;
             вʼїжджають лише нові повідомлення (freshIds), а не історія. -->
        {#key chatId}
          {#each messages as msg, idx (msg.id)}
            {@const dateLabel = shouldShowDateSeparator(idx)}
            {@const fresh = freshIds.has(msg.id)}
            <div in:fly={{ y: fresh ? 12 : 0, duration: fresh ? 200 : 0 }}>
              {#if dateLabel}
                <div class="flex justify-center py-3">
                  <span
                    class="rounded-full bg-chat-service px-2.5 py-0.5 text-[12.5px] font-medium text-chat-service-foreground backdrop-blur-md"
                  >
                    {dateLabel}
                  </span>
                </div>
              {/if}
              {#if msg.id === unreadFromId}
                <div class="my-3 flex justify-center" data-unread-divider>
                  <span
                    class="rounded-full border border-primary/25 bg-card/90 px-3 py-0.5 text-[12px] font-medium text-primary backdrop-blur-sm"
                  >
                    Непрочитані повідомлення
                  </span>
                </div>
              {/if}
              <MessageBubble
                message={msg}
                isMine={msg.senderId === currentUserId}
                isLastInGroup={isLastInGroup(idx)}
                showReadStatus={msg.senderId === currentUserId}
                isRead={isReadByPeer(msg)}
                isPending={pendingIds.has(msg.id)}
                isFailed={failedIds.has(msg.id)}
                isHighlighted={searchOpen && activeMatchId === msg.id}
                isFlashing={flashId === msg.id}
                replyAuthorName={replyAuthorName(msg)}
                {currentUserId}
                onReply={(m) => {
                  replyTo = m
                  editing = null
                }}
                onEdit={handleEdit}
                onDelete={(m) => (deleteTarget = m)}
                onReact={handleReact}
                onJumpTo={jumpTo}
              />
            </div>
          {/each}
        {/key}
      {/if}
    </div>
  </div>

  <!-- ═══════ HEADER ═══════
       Шапка — капсула 696×48, як і поле вводу, і пошук
       виїжджає В НІЙ, а не окремим рядком під нею, як у Telegram Web. Знайдене розкривається з тієї ж картки
       вниз ПОВЕРХ стрічки: тому картка абсолютна над місцем висотою в
       одну шапку, і стрічка під нею не стрибає.
       pointer-events-none на смузі: поза капсулою кліки й колесо миші
       мають діставатись стрічки під нею. -->
  <div
    bind:clientHeight={topH}
    class="pointer-events-none absolute inset-x-0 top-0 z-30 px-2 pt-2 sm:px-3 sm:pt-3"
  >
    <div class="relative mx-auto h-12 w-full max-w-174">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="pointer-events-auto absolute inset-x-0 top-0 overflow-hidden rounded-3xl border border-border/60 bg-card/85 backdrop-blur-xl transition-shadow duration-200 {resultsOpen
          ? 'shadow-lg'
          : 'shadow-sm'}"
        onfocusout={onHeaderFocusOut}
      >
        <header class="flex h-11.5 min-w-0 items-center gap-1 px-1 sm:pl-1.5">
          {#if searchOpen}
            <div
              class="flex min-w-0 flex-1 items-center gap-1"
              in:fly={{ y: -18, duration: 240, easing: cubicOut }}
            >
              <Search class="ml-2 size-5 shrink-0 text-muted-foreground" />
              <input
                bind:this={searchInput}
                bind:value={searchQuery}
                oninput={onSearchInput}
                onkeydown={onSearchKeydown}
                onclick={reopenResults}
                type="search"
                enterkeyhint="search"
                placeholder="Пошук у чаті"
                aria-label="Пошук у чаті"
                class="h-10 min-w-0 flex-1 bg-transparent px-2 text-[16px] outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
              />

              <!-- Обране в чаті — лічильник і крок до сусіднього збігу. -->
              {#if activeIndex !== -1 && !resultsOpen}
                <span
                  class="shrink-0 px-1 text-[13px] text-muted-foreground tabular-nums"
                  in:fade={{ duration: 150 }}
                >
                  {activeIndex + 1} з {searchResults.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  onclick={() => stepMatch(1)}
                  disabled={activeIndex >= searchResults.length - 1}
                  aria-label="Старіший збіг"
                  class="shrink-0 rounded-full text-muted-foreground"
                >
                  <ChevronUp class="size-5.25" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  onclick={() => stepMatch(-1)}
                  disabled={activeIndex <= 0}
                  aria-label="Новіший збіг"
                  class="shrink-0 rounded-full text-muted-foreground"
                >
                  <ChevronDown class="size-5.25" />
                </Button>
              {/if}

              <Button
                variant="ghost"
                size="icon-lg"
                onclick={closeSearch}
                aria-label="Закрити пошук"
                class="shrink-0 rounded-full text-muted-foreground"
              >
                <X class="size-5.25" />
              </Button>
            </div>
          {:else}
            <div
              class="flex min-w-0 flex-1 items-center gap-1"
              in:fade={{ duration: 180 }}
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
                <span class="relative shrink-0">
                  <Avatar class="size-9">
                    <AvatarImage src={peer.avatar ?? ''} alt={peer.name} />
                    <AvatarFallback class="bg-muted text-sm font-semibold">
                      {peer.name?.[0]?.toUpperCase() ?? '?'}
                    </AvatarFallback>
                  </Avatar>
                  {#if isOnline}
                    <span
                      class="absolute right-0 bottom-0 size-3 rounded-full border-2 border-card bg-emerald-500"
                      aria-hidden="true"
                    ></span>
                  {/if}
                </span>

                <div class="flex min-w-0 flex-1 flex-col justify-center">
                  <div class="flex min-w-0 items-center gap-1">
                    <p class="truncate text-[15px] leading-tight font-semibold">
                      {peer.name}
                    </p>
                    {#if peer.isVerified}
                      <BadgeCheck
                        class="size-4 shrink-0 fill-primary text-primary"
                      />
                    {/if}
                  </div>
                  <div class="mt-0.5 min-w-0 leading-tight">
                    {#if typingPeer}
                      <HeaderTyping />
                    {:else}
                      <p
                        class="truncate text-[13px] {isOnline
                          ? 'text-primary'
                          : 'text-muted-foreground'}"
                      >
                        {presenceLabel}
                      </p>
                    {/if}
                  </div>
                </div>
              </button>

              <Button
                variant="ghost"
                size="icon-lg"
                onclick={openSearch}
                aria-label="Пошук"
                class="shrink-0 rounded-full text-muted-foreground"
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
            </div>
          {/if}
        </header>

        <!-- ─── Знайдене: розкривається з шапки вниз ─── -->
        {#if searchOpen && resultsOpen}
          <div
            class="border-t border-border/60"
            transition:slide={{ duration: 220, easing: cubicOut }}
          >
            <SearchResults
              results={searchResults}
              query={searchQuery}
              cursor={searchCursor}
              {currentUserId}
              peerName={peer.name}
              onSelect={selectMatch}
              onHover={(i) => (searchCursor = i)}
            />
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- ═══ «Вниз» із лічильником нових ═══
       Стоїть на правому краї колонки стрічки, а не вікна: на широкому
       екрані інакше відʼїжджала б від повідомлень. Знизу — над полем
       вводу, хоч би якої висоти воно зараз. -->
  {#if !atBottom}
    <button
      type="button"
      transition:scale={{ duration: 160, start: 0.7 }}
      onclick={() => scrollToBottom()}
      aria-label={unseen > 0
        ? `Нових повідомлень: ${unseen}. Прокрутити вниз`
        : 'Прокрутити вниз'}
      class="absolute z-20 flex size-11 cursor-pointer items-center justify-center rounded-full border border-border/60 bg-card/90 text-muted-foreground shadow-md backdrop-blur-xl transition-colors hover:text-foreground"
      style="right: max(0.75rem, calc((100% - 43.5rem) / 2 + 0.75rem)); bottom: calc(var(--chat-bottom) + 0.75rem)"
    >
      <ChevronDown class="size-5.5" />
      {#if unseen > 0}
        <span
          class="absolute -top-1.5 left-1/2 flex h-5 min-w-5 -translate-x-1/2 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold tabular-nums text-primary-foreground"
        >
          {unseen > 99 ? '99+' : unseen}
        </span>
      {/if}
    </button>
  {/if}

  <!-- ═══════ НИЗ: помилка + поле вводу ═══════
       Один шар, і його висота — --chat-bottom: стрічка під ним знає,
       скільки місця лишити, навіть коли поле вводу виросло на кілька
       рядків чи над ним зʼявилась відповідь. -->
  <div
    bind:clientHeight={bottomH}
    class="pointer-events-none absolute inset-x-0 bottom-0 z-20"
  >
    {#if error}
      <div class="px-2 pt-2 sm:px-3">
        <div
          class="pointer-events-auto mx-auto w-full max-w-174 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-xs text-destructive backdrop-blur-xl"
          role="alert"
        >
          {error}
        </div>
      </div>
    {/if}

    <div class="px-2 pt-2 pb-2 sm:px-3 sm:pb-3">
      <div class="pointer-events-auto mx-auto w-full max-w-174">
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
          onEditLast={editLast}
          {onTyping}
        />
      </div>
    </div>
  </div>
</div>

<!-- Видалення — підтвердженням у стилі застосунку, а не системним
     confirm(), який на телефоні виглядає як помилка браузера. -->
<AlertDialog.Root
  open={deleteTarget !== null}
  onOpenChange={(o) => {
    if (!o) deleteTarget = null
  }}
>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Видалити повідомлення?</AlertDialog.Title>
      <AlertDialog.Description>
        Воно зникне в обох — і у вас, і у співрозмовника.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Скасувати</AlertDialog.Cancel>
      <AlertDialog.Action
        onclick={confirmDelete}
        class="bg-destructive text-white hover:bg-destructive/90"
      >
        Видалити
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<style>
  /* Відступи стрічки — висота шарів над нею (+ повітря), а
     scroll-padding — щоб scrollIntoView (межа «Непрочитані», перехід до
     цитати) ставив повідомлення під шапку, а не ПІД неї. */
  .chat-feed {
    /* Колонка стрічки — та сама, що в капсул: 696px і ті самі поля від
       країв вікна (0.5rem, від sm — 0.75rem). Але пузир останнього в
       групі має хвостик, що виступає за пузир на 5.6px (message-bubble,
       .tail-out / .tail-in), і він вилазив за край поля вводу. Тому
       колонка звужена рівно на хвостик з обох боків: кінчик хвостика
       лягає точно на лінію країв шапки й поля вводу, як у Telegram.
       content-box — поля йдуть поза max-width, як і в капсул. */
    --tail: 5.6px;
    box-sizing: content-box;
    max-width: calc(43.5rem - 2 * var(--tail));
    padding-inline: calc(0.5rem + var(--tail));
    padding-top: calc(var(--chat-top) + 1rem);
    padding-bottom: calc(var(--chat-bottom) + 0.5rem);
  }

  @media (min-width: 40rem) {
    .chat-feed {
      padding-inline: calc(0.75rem + var(--tail));
    }
  }

  /* Те, що заїхало під шапку й під поле вводу, пригасає (до 15% біля
     краю вікна), а до краю капсул стрічка повністю непрозора. Маска лише
     на змісті: шпалери лежать під стрічкою окремо, їх вона не чіпає.
     Рахується від вікна (контейнер скролу не їде разом зі змістом), тож
     межа завжди там, де капсули. */
  .chat-scroll {
    /* Без системної смуги прокрутки, як у Telegram Web. Стрічка тепер на
       всю ширину вікна, і смуга (12px, layout.css) забирала їх праворуч:
       колонка повідомлень центрувалась у вужчій області й не доходила до
       правого краю поля вводу. Прокрутка колесом, тачпадом і дотиком
       лишається. */
    scrollbar-width: none;
    scroll-padding-top: calc(var(--chat-top) + 0.5rem);
    scroll-padding-bottom: calc(var(--chat-bottom) + 0.5rem);
    -webkit-mask-image: linear-gradient(
      to bottom,
      rgb(0 0 0 / 0.15) 0,
      #000 var(--chat-top),
      #000 calc(100% - var(--chat-bottom)),
      rgb(0 0 0 / 0.15) 100%
    );
    mask-image: linear-gradient(
      to bottom,
      rgb(0 0 0 / 0.15) 0,
      #000 var(--chat-top),
      #000 calc(100% - var(--chat-bottom)),
      rgb(0 0 0 / 0.15) 100%
    );
  }

  /* Старіші Safari не знають scrollbar-width */
  .chat-scroll::-webkit-scrollbar {
    display: none;
  }
</style>
