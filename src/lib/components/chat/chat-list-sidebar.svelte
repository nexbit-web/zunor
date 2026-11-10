<script lang="ts">
  import { goto } from '$app/navigation'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import SegmentedControl from '$lib/components/segmented-control.svelte'
  import { MessagesIcon } from '$lib/components/icons'
  import ArrowLeft from '$lib/components/icons/set/arrow-left.svelte'
  import BadgeCheck from '$lib/components/icons/set/badge-check.svelte'
  import Check from '$lib/components/icons/set/check.svelte'
  import CheckCheck from '$lib/components/icons/set/check-check.svelte'
  import Search from '$lib/components/icons/set/search.svelte'
  import X from '$lib/components/icons/set/x.svelte'
  import { useEntryPoint } from '$lib/utils/entry-point.svelte'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { formatChatTime } from './calendar-time'
  import { chatDrafts } from './drafts.svelte'
  import type { ChatPreview } from './types'

  interface Props {
    activeChatId?: string | null
    currentUserId: string
  }

  let { activeChatId = null, currentUserId }: Props = $props()

  type Tab = 'all' | 'unread'

  let search = $state('')
  let tab = $state<Tab>('all')

  // Панель дашборда в повідомленнях відʼїжджає — «Назад» ліворуч від
  // пошуку повертає туди, звідки зайшли (лейаут розділу). Поза ним
  // (тести, інше місце) кнопки немає.
  const back = useEntryPoint()

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

  function previewLabel(c: ChatPreview): string {
    if (!c.lastMessageText) return 'Чат створено'
    return c.lastSenderId === currentUserId
      ? `Ви: ${c.lastMessageText}`
      : c.lastMessageText
  }

  /** Моє останнє прочитане? — ✓✓, ні — ✓; чуже — без галочок. */
  function myLastStatus(c: ChatPreview): 'read' | 'sent' | null {
    if (c.lastSenderId !== currentUserId || !c.lastMessageAt) return null
    return c.peerLastReadAt &&
      new Date(c.peerLastReadAt) >= new Date(c.lastMessageAt)
      ? 'read'
      : 'sent'
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
  <!-- Капсула з фоном і рамкою поля — як усі поля застосунку, а у
       фокусі, як у Telegram, рамка й лупа кольору акценту, а тло — кольору
       сторінки. Друга половина товщини рамки на фокусі — тінь, щоб поле
       не «стрибало».
       pt-[max(...)] — щоб на iPhone поле не залазило під «чубчик». -->
  <div
    class="flex shrink-0 items-center gap-1.5 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2.5"
  >
    {#if back}
      <!-- Як кнопка меню біля пошуку в Telegram: та сама висота, що й
           поле, без тла, доки не наведеш. -->
      <a
        href={back.href}
        data-sveltekit-preload-data="tap"
        aria-label="Назад"
        title="Назад"
        class="-ml-1 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ArrowLeft class="size-5.5" strokeWidth={1.75} aria-hidden="true" />
      </a>
    {/if}
    <label
      class="group flex h-11 min-w-0 flex-1 cursor-text items-center rounded-full border border-input bg-field transition-[border-color,background-color,box-shadow] duration-150 focus-within:border-primary focus-within:bg-background focus-within:shadow-[0_0_0_1px_var(--color-primary)]"
    >
      <Search
        class="ml-3 size-5 shrink-0 text-muted-foreground transition-colors duration-150 group-focus-within:text-primary"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <input
        type="text"
        bind:value={search}
        placeholder="Пошук"
        aria-label="Пошук чату"
        autocomplete="off"
        class="h-full min-w-0 flex-1 bg-transparent pr-2 pl-2.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
      />
      {#if search}
        <button
          type="button"
          onclick={() => (search = '')}
          class="mr-1.5 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Очистити пошук"
        >
          <X class="size-4" />
        </button>
      {/if}
    </label>
  </div>

  <!-- ─── ФІЛЬТР ─── -->
  <div class="shrink-0 px-3 pb-2">
    <SegmentedControl
      bind:value={tab}
      label="Які чати показати"
      options={[
        { value: 'all', label: 'Усі' },
        { value: 'unread', label: 'Непрочитані', count: unreadTotal },
      ]}
    />
  </div>

  <!-- ─── СПИСОК ─── -->
  <!-- pb на мобільному враховує домашню смужку iPhone -->
  <div
    class="flex-1 overflow-y-auto px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
  >
    {#if !chatStore.initialized}
      <div class="space-y-0.5">
        {#each Array.from({ length: 7 }), i (i)}
          <div class="flex h-18 items-center gap-2.5 px-2.25">
            <Skeleton class="size-13.5 shrink-0 rounded-full" />
            <div class="flex-1 space-y-2.5">
              <Skeleton class="h-4 w-2/3" />
              <Skeleton class="h-3.5 w-1/2" />
            </div>
          </div>
        {/each}
      </div>
    {:else if filtered.length === 0}
      <div
        class="flex h-full flex-col items-center justify-center px-6 py-12 text-center"
      >
        <!-- Та сама бульбашка, що й у пункті «Повідомлення» панелі, лише
             без крапок «хтось пише»: тут якраз ніхто нічого не пише. -->
        <MessagesIcon
          size={40}
          strokeWidth={1.25}
          dots={false}
          class="mb-4 text-muted-foreground/70"
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
          <!-- Чернетку відкритого чату видно в самому полі вводу. -->
          {@const draft = isActive
            ? ''
            : chatDrafts.get(currentUserId, chat.id)}
          {@const status = myLastStatus(chat)}
          <!-- Розміри — Telegram Web, зняті зі скриншота: рядок 72px,
               аватар 54px, імʼя й превʼю 16px на рядку 24px, час 12px.
               Активний чат — суцільна заливка кольором primary, як у
               Telegram. Інверсію кольорів усередині (імʼя, час, галочки,
               превʼю, лічильник) робить ОДНЕ правило .chat-row-active у
               стилях нижче, а не class:-модифікатор на кожному елементі:
               так новий елемент рядка не випаде з інверсії. -->
          <button
            type="button"
            onclick={() => goto(`/dashboard/messages/${chat.id}`)}
            aria-current={isActive ? 'page' : undefined}
            class="flex h-18 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.25 text-left transition-colors {isActive
              ? 'chat-row-active'
              : 'hover:bg-muted/50'}"
          >
            <Avatar class="size-13.5 shrink-0">
              <AvatarImage src={chat.peer.avatar ?? ''} alt="" />
              <AvatarFallback class="bg-muted text-lg font-semibold">
                {chat.peer.name?.[0]?.toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>

            <div class="min-w-0 flex-1">
              <!-- Верхній рядок: імʼя · час -->
              <div class="flex items-baseline justify-between gap-2">
                <div class="flex min-w-0 items-center gap-1">
                  <p
                    class="truncate text-base leading-6 font-semibold text-foreground"
                  >
                    {chat.peer.name}
                  </p>
                  {#if chat.peer.isVerified}
                    <BadgeCheck
                      class="verified size-4.5 shrink-0 fill-primary text-primary-foreground"
                    />
                  {/if}
                </div>
                <span
                  class="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground"
                >
                  {#if status === 'read'}
                    <CheckCheck
                      class="size-4 text-primary"
                      aria-label="Прочитано"
                    />
                  {:else if status === 'sent'}
                    <Check class="size-4" aria-label="Надіслано" />
                  {/if}
                  {formatChatTime(chat.lastMessageAt)}
                </span>
              </div>

              <!-- Нижній рядок: превʼю · лічильник -->
              <div class="flex items-center justify-between gap-2">
                {#if draft}
                  <!-- Як у Telegram: недописане видно, щоб до нього
                       повернутись. -->
                  <p class="truncate text-base leading-6">
                    <span class="text-destructive">Чернетка:</span>
                    <span class="text-muted-foreground">{draft}</span>
                  </p>
                {:else}
                  <p
                    class="truncate text-base leading-6 {hasUnread
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground'}"
                  >
                    {previewLabel(chat)}
                  </p>
                {/if}
                {#if hasUnread}
                  <span
                    class="unread-count flex h-5.5 min-w-5.5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[13px] font-semibold tabular-nums text-primary-foreground"
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
  /*
   * Активний чат: заливка акцентом, усе всередині — кольором тексту на
   * акценті (primary-foreground). Вторинне (час, превʼю) — те саме, лише
   * приглушене. Лічильник і галочка верифікації інвертуються: біле коло
   * з акцентним числом/галочкою. Кольори — з токенів, тож працює з будь-
   * яким акцентом, і з чорно-білим теж.
   */
  .chat-row-active {
    background-color: var(--primary);
    color: var(--primary-foreground);
  }
  .chat-row-active :global(.text-foreground),
  .chat-row-active :global(.text-primary) {
    color: var(--primary-foreground);
  }
  .chat-row-active :global(.text-muted-foreground) {
    color: color-mix(in srgb, var(--primary-foreground) 78%, transparent);
  }
  .chat-row-active .unread-count {
    background-color: var(--primary-foreground);
    color: var(--primary);
  }
  .chat-row-active :global(.verified) {
    fill: var(--primary-foreground);
    color: var(--primary);
  }
</style>
