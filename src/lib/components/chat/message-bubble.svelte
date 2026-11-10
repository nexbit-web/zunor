<!--
  Повідомлення в стрічці чату — поводиться як у Telegram:

  • меню — правою кнопкою на компʼютері й довгим дотиком на телефоні
    (ContextMenu з bits-ui вміє обидва), угорі смужка реакцій, під нею
    дії. Кнопка-смайлик біля бульбашки відкриває те саме меню — для миші
    без правої кнопки й для клавіатури;
  • подвійний клік / дотик — швидка реакція ❤️;
  • свайп ліворуч на телефоні — відповісти;
  • реакції — чипами всередині бульбашки, свою видно одразу й знімається
    тим самим дотиком;
  • посилання клікабельні, під текстом — картка першого з них (сайт,
    заголовок, опис), цитата веде до свого повідомлення.

  Логіки даних тут немає: що поставити й куди відправити, вирішує
  chat-window — бульбашка лише кличе колбеки.
-->
<script lang="ts">
  import { ContextMenu, mergeProps } from 'bits-ui'
  import AlertCircle from '$lib/components/icons/set/circle-alert.svelte'
  import Check from '$lib/components/icons/set/check.svelte'
  import CheckCheck from '$lib/components/icons/set/check-check.svelte'
  import Clock from '$lib/components/icons/set/clock.svelte'
  import Copy from '$lib/components/icons/set/copy.svelte'
  import Download from '$lib/components/icons/set/download.svelte'
  import FileText from '$lib/components/icons/set/file-text.svelte'
  import Link from '$lib/components/icons/set/link.svelte'
  import Pencil from '$lib/components/icons/set/pencil.svelte'
  import Reply from '$lib/components/icons/set/reply.svelte'
  import SmilePlus from '$lib/components/icons/set/smile-plus.svelte'
  import Trash2 from '$lib/components/icons/set/trash-2.svelte'
  import { copyToClipboard } from '$lib/utils/clipboard'
  import { firstLink, linkify } from './linkify'
  import { QUICK_REACTION, REACTIONS } from './reactions'
  import type { ChatMessage, LinkPreview } from './types'

  interface Props {
    message: ChatMessage
    isMine: boolean
    /** Останнє в групі → малюємо хвостик */
    isLastInGroup: boolean
    showReadStatus: boolean
    isRead: boolean
    isPending?: boolean
    isFailed?: boolean
    /** Підсвітити (для search highlight) */
    isHighlighted?: boolean
    /** Короткий спалах: сюди щойно перейшли з цитати. */
    isFlashing?: boolean
    /** Імʼя автора цитованого повідомлення */
    replyAuthorName?: string
    /** Хто дивиться — його реакцію підсвічуємо. */
    currentUserId?: string
    onReply?: (m: ChatMessage) => void
    onEdit?: (m: ChatMessage) => void
    onDelete?: (m: ChatMessage) => void
    /** Натиснули емодзі — що з ним робити (поставити/зняти), вирішує вікно. */
    onReact?: (m: ChatMessage, emoji: string) => void
    /** Клік по цитаті — перейти до процитованого. */
    onJumpTo?: (messageId: string) => void
  }

  let {
    message,
    isMine,
    isLastInGroup,
    showReadStatus,
    isRead,
    isPending = false,
    isFailed = false,
    isHighlighted = false,
    isFlashing = false,
    replyAuthorName = '',
    currentUserId = '',
    onReply,
    onEdit,
    onDelete,
    onReact,
    onJumpTo,
  }: Props = $props()

  const time = $derived(
    new Date(message.createdAt).toLocaleTimeString('uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  )

  const isPhoto = $derived(
    message.type === 'PHOTO' && !!message.attachmentUrl && !message.deletedAt,
  )
  const isFile = $derived(
    message.type === 'FILE' && !!message.attachmentUrl && !message.deletedAt,
  )

  /** Меню недоступне для видалених і ще не надісланих */
  const showMenu = $derived(!message.deletedAt && !isPending && !isFailed)

  /** Редагувати можна тільки свій текст і тільки протягом доби */
  const canEdit = $derived(
    isMine &&
      message.type === 'TEXT' &&
      Date.now() - new Date(message.createdAt).getTime() < 24 * 60 * 60 * 1000,
  )

  const reactions = $derived(message.deletedAt ? [] : (message.reactions ?? []))

  /**
   * Фото без підпису, цитати й реакцій — без бульбашки, як у Telegram:
   * сам знімок у тонкій світлій рамці, час — плашкою поверх нього.
   * Залита бульбашка давала навколо фото товсту рамку кольору акценту, і
   * знімок виглядав вклеєним у кольорову плашку. Підпис, цитата чи
   * реакції — це текст, йому потрібне тло, тож тоді бульбашка лишається.
   */
  const barePhoto = $derived(
    isPhoto && !message.text && !message.replyTo && reactions.length === 0,
  )
  const parts = $derived(linkify(message.text))
  const link = $derived(firstLink(message.text))
  const preview = $derived(
    message.deletedAt || message.type !== 'TEXT'
      ? null
      : (message.linkPreview ?? null),
  )

  // Варіанти кольору тримаємо тут, а не в розмітці:
  // інакше кожен вкладений елемент обростає своїм тернарником
  const bubbleTone = $derived(
    isMine
      ? 'bg-primary text-primary-foreground'
      : 'bg-bubble-in text-card-foreground',
  )
  const metaTone = $derived(
    isMine ? 'text-primary-foreground/75' : 'text-muted-foreground',
  )
  const quoteTone = $derived(
    isMine ? 'border-white/80 bg-white/15' : 'border-primary bg-primary/10',
  )
  const quoteAuthorTone = $derived(isMine ? 'text-white' : 'text-primary')
  const tintTone = $derived(isMine ? 'bg-white/15' : 'bg-primary/10')
  const linkTone = $derived(isMine ? 'text-primary-foreground' : 'text-primary')

  function formatSize(bytes: number | null): string {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  function replyPreview(): string {
    if (!message.replyTo) return ''
    if (message.replyTo.type === 'PHOTO') return 'Фото'
    if (message.replyTo.type === 'FILE') return 'Файл'
    // Текст порожній лише в одному випадку — оригінал видалили (сервер
    // не віддає видаленого навіть у цитаті).
    return message.replyTo.text || 'Повідомлення видалено'
  }

  // ═══════════════════════ Меню ═══════════════════════

  let menuOpen = $state(false)
  let bubbleEl = $state<HTMLElement | null>(null)

  /**
   * Кнопка-смайлик відкриває ТЕ САМЕ контекстне меню, що й права кнопка:
   * подія contextmenu в точці кнопки. Друге меню з тими самими пунктами
   * рано чи пізно розійшлося б із першим.
   */
  function openMenuFrom(e: MouseEvent) {
    const btn = e.currentTarget as HTMLElement
    const r = btn.getBoundingClientRect()
    bubbleEl?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: isMine ? r.left : r.right,
        clientY: r.bottom,
      }),
    )
  }

  function react(emoji: string) {
    menuOpen = false
    onReact?.(message, emoji)
  }

  function onDblClick(e: MouseEvent) {
    if (!showMenu || !onReact) return
    if ((e.target as HTMLElement).closest('a, button')) return
    // Подвійний клік виділяє слово — тут він означає реакцію.
    window.getSelection()?.removeAllRanges()
    onReact(message, QUICK_REACTION)
  }

  // ═══════════════════════ Свайп — відповісти ═══════════════════════

  const SWIPE_MAX = 72
  const SWIPE_TRIGGER = 56

  let swipeX = $state(0)
  let swiping = $state(false)
  let swipeStart: { x: number; y: number; id: number } | null = null

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType !== 'touch' || !onReply || !showMenu) return
    swipeStart = { x: e.clientX, y: e.clientY, id: e.pointerId }
  }

  function onPointerMove(e: PointerEvent) {
    if (!swipeStart || e.pointerId !== swipeStart.id) return
    const dx = e.clientX - swipeStart.x
    const dy = e.clientY - swipeStart.y
    if (!swiping) {
      // Пішов по вертикалі — це прокрутка стрічки, не свайп.
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        swipeStart = null
        return
      }
      if (dx > -10 || Math.abs(dx) <= Math.abs(dy)) return
      swiping = true
    }
    swipeX = Math.max(-SWIPE_MAX, Math.min(0, dx))
  }

  function onPointerEnd() {
    if (swiping && swipeX <= -SWIPE_TRIGGER) {
      onReply?.(message)
      navigator.vibrate?.(10)
    }
    swipeStart = null
    swiping = false
    swipeX = 0
  }
</script>

{#snippet meta()}
  {#if message.editedAt}<span class="italic">ред.</span>{/if}
  <span class="tabular-nums">{time}</span>
  {#if isMine}
    {#if isFailed}
      <AlertCircle class="size-3.5 shrink-0 text-destructive" />
    {:else if isPending}
      <Clock class="size-3.5 shrink-0" />
    {:else if showReadStatus && isRead}
      <CheckCheck class="size-3.5 shrink-0" aria-label="Прочитано" />
    {:else if showReadStatus}
      <Check class="size-3.5 shrink-0" aria-label="Надіслано" />
    {/if}
  {/if}
{/snippet}

<!-- Час у кінці тексту: float підбирає його в той самий рядок, де
     закінчився текст; не влазить — браузер сам зносить його нижче. Коли
     є реакції, час стоїть у їхньому рядку праворуч, як у Telegram. -->
{#snippet floatMeta()}
  {#if reactions.length === 0}
    <span
      class="meta float-right ml-2.5 inline-flex items-center gap-[3px] pt-1.5 text-[11px] leading-3 whitespace-nowrap select-none {metaTone}"
    >
      {@render meta()}
    </span>
  {/if}
{/snippet}

<!-- Картка посилання — в тій самій мові, що й цитата: смуга ліворуч і
     назва сайту кольором акценту. Без картинки (див. server/link-preview). -->
{#snippet linkCard(p: LinkPreview)}
  <a
    href={p.url}
    target="_blank"
    rel="noopener noreferrer nofollow ugc"
    class="mt-1.5 block rounded border-l-[3px] px-2 py-1 text-[13px] leading-[17px] transition-opacity hover:opacity-90 {quoteTone}"
  >
    <span class="block truncate font-semibold {quoteAuthorTone}">
      {p.siteName}
    </span>
    {#if p.title}
      <span class="line-clamp-2 block font-semibold">{p.title}</span>
    {/if}
    {#if p.description}
      <span class="line-clamp-3 block opacity-85">{p.description}</span>
    {/if}
  </a>
  {#if reactions.length === 0}
    <span
      class="mt-1 flex items-center justify-end gap-[3px] text-[11px] leading-3 whitespace-nowrap select-none {metaTone}"
    >
      {@render meta()}
    </span>
  {/if}
{/snippet}

{#snippet richText()}
  {#each parts as part, i (i)}
    {#if part.kind === 'link'}
      <a
        href={part.href}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        class="font-medium wrap-anywhere underline decoration-current/40 underline-offset-2 hover:decoration-current {linkTone}"
        >{part.value}</a
      >
    {:else}{part.value}{/if}
  {/each}
{/snippet}

<div
  class="group relative flex {isMine
    ? 'justify-end'
    : 'justify-start'} {isLastInGroup
    ? reactions.length
      ? 'mb-3'
      : 'mb-2.5'
    : 'mb-0.5'}"
  data-message-id={message.id}
>
  <!-- Стрілка «відповісти», що проступає під час свайпу. -->
  {#if swipeX < 0}
    <span
      class="pointer-events-none absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-white"
      style:opacity={Math.min(1, -swipeX / SWIPE_TRIGGER)}
      style:transform="translateY(-50%) scale({0.6 +
        0.4 * Math.min(1, -swipeX / SWIPE_TRIGGER)})"
      aria-hidden="true"
    >
      <Reply class="size-4" />
    </span>
  {/if}

  <div
    class="flex max-w-[min(85%,520px)] items-end gap-1 sm:max-w-[min(72%,520px)] {isMine
      ? 'flex-row-reverse'
      : ''}"
  >
    <ContextMenu.Root bind:open={menuOpen}>
      <ContextMenu.Trigger disabled={!showMenu}>
        {#snippet child({ props })}
          <!-- mergeProps, а не два спреди: на pointer-подіях тригера
               bits-ui тримає довгий дотик, і наші обробники свайпу його
               просто перетерли б. -->
          <div
            {...mergeProps(props, {
              ondblclick: onDblClick,
              onpointerdown: onPointerDown,
              onpointermove: onPointerMove,
              onpointerup: onPointerEnd,
              onpointercancel: onPointerEnd,
            })}
            bind:this={bubbleEl}
            class={[
              'bubble relative w-fit max-w-full rounded-2xl text-[15px] leading-5',
              // Фото з підписом: знімок угорі майже впритул до країв
              // бульбашки — 2px її тла, а не товста рамка.
              !barePhoto && [
                'shadow-sm',
                bubbleTone,
                // Без overflow-hidden: він зрізав хвостик фото з підписом,
                // а кути знімка й так скруглює посилання навколо нього.
                isPhoto ? 'p-0.5' : 'px-3 py-1.5',
              ],
            ]}
            class:bubble-mine={isMine && !barePhoto}
            class:tail-in={isLastInGroup && !isMine && !barePhoto}
            class:tail-out={isLastInGroup && isMine && !barePhoto}
            class:opacity-70={isPending}
            class:ring-2={isHighlighted}
            class:ring-ring={isHighlighted}
            class:flash={isFlashing}
            class:snap={!swiping}
            style:transform={swipeX ? `translateX(${swipeX}px)` : undefined}
          >
            <!-- ─── Цитата: клік — перейти до оригіналу ─── -->
            {#if message.replyTo}
              {@const replyId = message.replyTo.id}
              <button
                type="button"
                onclick={() => onJumpTo?.(replyId)}
                class="mb-1 block w-full cursor-pointer rounded border-l-[3px] px-2 py-0.5 text-left text-[13px] leading-[17px] transition-opacity hover:opacity-90 {quoteTone}"
              >
                {#if replyAuthorName}
                  <span class="block font-semibold {quoteAuthorTone}">
                    {replyAuthorName}
                  </span>
                {/if}
                <span
                  class="line-clamp-1 opacity-85"
                  class:italic={!message.replyTo.text &&
                    message.replyTo.type === 'TEXT'}>{replyPreview()}</span
                >
              </button>
            {/if}

            {#if message.deletedAt}
              <p class="m-0 italic opacity-60">
                Повідомлення видалено<span
                  class="meta float-right ml-2.5 inline-flex items-center gap-[3px] pt-1.5 text-[11px] leading-3 tabular-nums whitespace-nowrap select-none {metaTone}"
                >
                  {time}
                </span>
              </p>
            {:else if isPhoto}
              <!-- Клік відкриває галерею всіх фото чату (PhotoSwipe у
                   chat-window). Без JS — звичайна нова вкладка. -->
              <a
                href={message.attachmentUrl}
                target="_blank"
                rel="noopener"
                data-pswp
                class={[
                  'block overflow-hidden',
                  // Без бульбашки рамку дає сам знімок: 2px кольору
                  // вхідної бульбашки — білий на світлій темі, тон картки
                  // на темній. Легкий контур, що відділяє фото від шпалер.
                  barePhoto
                    ? 'rounded-2xl border-2 border-bubble-in shadow-sm'
                    : 'rounded-[14px]',
                ]}
              >
                <img
                  src={message.attachmentUrl}
                  alt={message.text || 'Фото'}
                  loading="lazy"
                  class="block h-auto w-full max-w-80 cursor-zoom-in object-cover"
                />
              </a>

              {#if message.text}
                <p
                  class="m-0 px-1.5 pt-1 pb-px wrap-break-word whitespace-pre-wrap"
                >
                  {@render richText()}{@render floatMeta()}
                </p>
              {:else if reactions.length === 0}
                <!-- Без підпису час лягає плашкою поверх знімка -->
                <span
                  class="absolute right-2.5 bottom-2.5 inline-flex items-center gap-[3px] rounded-full bg-black/45 px-2 py-0.5 text-[11px] leading-3 whitespace-nowrap text-white backdrop-blur-sm select-none"
                >
                  {@render meta()}
                </span>
              {/if}
            {:else if isFile}
              <a
                href={message.attachmentUrl}
                target="_blank"
                rel="noopener"
                download={message.attachmentName ?? undefined}
                class="group/file flex items-center gap-2.5 py-0.5"
              >
                <span
                  class="flex size-9 shrink-0 items-center justify-center rounded-[10px] {tintTone}"
                >
                  <FileText class="size-4" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate text-[13px] font-medium">
                    {message.attachmentName ?? 'Файл'}
                  </span>
                  <span class="text-[11px] {metaTone}">
                    {formatSize(message.attachmentSize)}
                  </span>
                </span>
                <Download
                  class="size-4 shrink-0 opacity-0 transition-opacity group-hover/file:opacity-100"
                />
              </a>

              <p class="m-0 pt-1 wrap-break-word whitespace-pre-wrap">
                {@render richText()}{@render floatMeta()}
              </p>
            {:else if preview}
              <!-- Час — під карткою, а не в рядку тексту над нею. -->
              <p class="m-0 wrap-break-word whitespace-pre-wrap">
                {@render richText()}
              </p>
              {@render linkCard(preview)}
            {:else}
              <p class="m-0 wrap-break-word whitespace-pre-wrap">
                {@render richText()}{@render floatMeta()}
              </p>
            {/if}

            <!-- ─── Реакції: свою знімає той самий дотик ─── -->
            {#if reactions.length > 0}
              <div
                class="mt-1.5 flex flex-wrap items-end gap-1"
                class:px-1.5={isPhoto}
                class:pb-1={isPhoto}
              >
                {#each reactions as r (r.emoji)}
                  {@const mine = r.userIds.includes(currentUserId)}
                  <button
                    type="button"
                    class="reaction"
                    class:reaction-mine={mine}
                    class:on-mine-bubble={isMine}
                    onclick={() => onReact?.(message, r.emoji)}
                    disabled={!onReact || !showMenu}
                    aria-pressed={mine}
                    aria-label={mine
                      ? `Ваша реакція ${r.emoji}, зняти`
                      : `Реакція ${r.emoji}`}
                  >
                    <span class="reaction-emoji">{r.emoji}</span>
                    {#if r.userIds.length > 1}
                      <span class="tabular-nums">{r.userIds.length}</span>
                    {/if}
                  </button>
                {/each}
                <span
                  class="ml-auto inline-flex items-center gap-[3px] pl-2 text-[11px] leading-3 whitespace-nowrap select-none {metaTone}"
                >
                  {@render meta()}
                </span>
              </div>
            {/if}
          </div>
        {/snippet}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content
          class="z-50 w-66 origin-(--bits-context-menu-content-transform-origin) rounded-2xl border border-border bg-popover p-1.5 shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <!-- Смужка реакцій — як у Telegram, над діями. -->
          {#if onReact}
            <div
              class="mb-1 flex items-center justify-between gap-0.5 rounded-xl bg-muted/60 p-1"
              role="group"
              aria-label="Реакції"
            >
              {#each REACTIONS as emoji (emoji)}
                <button
                  type="button"
                  class="pick"
                  class:pick-mine={reactions.some(
                    (r) =>
                      r.emoji === emoji && r.userIds.includes(currentUserId),
                  )}
                  onclick={() => react(emoji)}
                  aria-label="Реакція {emoji}"
                >
                  {emoji}
                </button>
              {/each}
            </div>
          {/if}

          {#if onReply}
            <ContextMenu.Item
              class="chat-menu-item"
              onSelect={() => onReply?.(message)}
            >
              <Reply class="size-4 text-muted-foreground" />
              <span>Відповісти</span>
            </ContextMenu.Item>
          {/if}

          {#if message.text}
            <ContextMenu.Item
              class="chat-menu-item"
              onSelect={() => copyToClipboard(message.text, 'Текст скопійовано')}
            >
              <Copy class="size-4 text-muted-foreground" />
              <span>Копіювати</span>
            </ContextMenu.Item>
          {/if}

          {#if link}
            {@const href = link}
            <ContextMenu.Item
              class="chat-menu-item"
              onSelect={() => copyToClipboard(href, 'Посилання скопійовано')}
            >
              <Link class="size-4 text-muted-foreground" />
              <span>Копіювати посилання</span>
            </ContextMenu.Item>
          {/if}

          {#if canEdit && onEdit}
            <ContextMenu.Item
              class="chat-menu-item"
              onSelect={() => onEdit?.(message)}
            >
              <Pencil class="size-4 text-muted-foreground" />
              <span>Редагувати</span>
            </ContextMenu.Item>
          {/if}

          {#if isMine && onDelete}
            <ContextMenu.Separator class="my-1 h-px bg-border" />
            <ContextMenu.Item
              class="chat-menu-item chat-menu-item-danger"
              onSelect={() => onDelete?.(message)}
            >
              <Trash2 class="size-4" />
              <span>Видалити</span>
            </ContextMenu.Item>
          {/if}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>

    <!-- ─── Кнопка меню біля бульбашки (миша без правої кнопки, клавіатура) ───
         Внизу, біля краю пузиря, як у Telegram, а не посередині висоти. -->
    {#if showMenu}
      <button
        type="button"
        onclick={openMenuFrom}
        aria-label="Меню повідомлення"
        aria-haspopup="menu"
        class="mb-0.5 flex size-7 shrink-0 cursor-pointer items-center justify-center self-end rounded-full bg-black/25 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden"
      >
        <SmilePlus class="size-4" />
      </button>
    {/if}
  </div>
</div>

<style>
  /*
   * Свої повідомлення — градієнтом, як в iMessage: світліші вгорі екрана,
   * глибші внизу. Градієнт прибитий до ВІКНА (attachment: fixed), а не до
   * пузиря, тож при прокрутці колір «тече» по стрічці. Кольори — з
   * акценту (--primary), тому працюють з будь-яким обраним у
   * налаштуваннях. bg-primary під ним лишається запасним кольором.
   */
  .bubble-mine {
    --mine-from: color-mix(in oklab, var(--primary), white 14%);
    --mine-to: color-mix(in oklab, var(--primary), black 8%);
    background-image: linear-gradient(
      to bottom,
      var(--mine-from),
      var(--mine-to)
    );
    background-attachment: fixed;
  }

  /*
   * Хвостик як в iMessage. Геометрія — з відомої CSS-версії iMessage
   * (тіло хвоста з еліптичним кутом мінус круглий виріз), перенесена в
   * SVG-контур: виріз кольором тла ламався б на будь-якому нерівному тлі
   * (градієнт свого пузиря, підсвітка). Від правого
   * нижнього кута пузиря:
   *   • край іде ПРЯМО вниз до 8.4px над низом (кут не заокруглюється —
   *     хвіст його заповнює);
   *   • далі — увігнута дуга r=8 назовні до гострого кінчика на лінії
   *     низу, на 5.6px за краєм;
   *   • низ під хвостом рівний, потім опукла дуга (12.8×11.2) вгору — і
   *     зустрічає заокруглення пузиря виїмкою ~6px від краю.
   * Псевдоелемент 16×16: ліві 10.4px — на куті пузиря, праві 5.6px —
   * кінчик. Вхідний — дзеркальний.
   *
   * Шар: пузир — окремий контекст накладання (isolation), а хвіст у ньому
   * з z-index: -1. Тоді порядок такий: тінь і тло пузиря → хвіст → текст.
   * Хвіст не перекриває час і галочки, а тінь пузиря не лягає на хвіст.
   *
   * Тло хвоста успадковується від пузиря цілком (background: inherit):
   * у свого це той самий прибитий до вікна градієнт, тож колір хвоста
   * збігається з пузирем піксель у піксель.
   */
  .bubble {
    isolation: isolate;
  }

  .tail-in::after,
  .tail-out::after {
    content: '';
    position: absolute;
    bottom: 0;
    z-index: -1;
    width: 16px;
    height: 16px;
    background: inherit;
    pointer-events: none;
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M0 0H10.4V7.6A8 8 0 0 0 16 15.23V16H12.8A12.8 11.2 0 0 1 0 4.8Z'/%3E%3C/svg%3E")
      center / 100% 100% no-repeat;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M0 0H10.4V7.6A8 8 0 0 0 16 15.23V16H12.8A12.8 11.2 0 0 1 0 4.8Z'/%3E%3C/svg%3E")
      center / 100% 100% no-repeat;
  }

  /*
   * Нижній кут пузиря з боку хвоста — прямий. Скруглений на 16px, він
   * перетинався з внутрішньою дугою хвоста приблизно за 3px над низом, і
   * нижній контур там спершу піднімався, а потім падав: виходив помітний
   * «зубчик» між пузирем і хвостом. З прямим кутом контур рівний —
   * лишається сходинка 0.2px, оку невидима. Звірено рендером.
   */
  .tail-out {
    border-bottom-right-radius: 0;
  }

  .tail-in {
    border-bottom-left-radius: 0;
  }

  .tail-out::after {
    right: -5.6px;
  }

  .tail-in::after {
    left: -5.6px;
    transform: scaleX(-1);
  }

  /*
   * На дотику (iOS Safari, Android) fixed-тло або не підтримується, або
   * перемальовує кожен пузир на кожному кадрі прокрутки. Там градієнт —
   * свій у кожного пузиря, і закінчується за 16px до низу (висота
   * хвоста): нижня смуга суцільна, і хвіст (суцільний нижній колір) з нею
   * збігається.
   */
  @media (pointer: coarse) {
    .bubble-mine {
      background-image: linear-gradient(
        to bottom,
        var(--mine-from),
        var(--mine-to) calc(100% - 16px)
      );
      background-attachment: scroll;
    }
    .bubble-mine.tail-out::after {
      background: var(--mine-to);
    }
  }

  /* Час має сідати на базову лінію останнього рядка, а не над нею */
  .meta {
    margin-top: 6px;
  }

  /* Горизонтальний рух віддаємо свайпу, вертикальний — прокрутці. */
  .bubble {
    touch-action: pan-y;
  }
  .bubble.snap {
    transition: transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }

  /* На дотику довгий тап відкриває меню (там «Копіювати») — системне
     виділення тексту з лупою лише заважало б йому. */
  @media (pointer: coarse) {
    .bubble {
      -webkit-touch-callout: none;
      user-select: none;
    }
  }

  /* Спалах після переходу з цитати — видно, КУДИ привело. */
  .bubble.flash {
    animation: flash 1.4s ease-out;
  }
  @keyframes flash {
    0%,
    35% {
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 55%, transparent);
    }
    100% {
      box-shadow: 0 0 0 0 transparent;
    }
  }

  /* ─── Чипи реакцій ─── */
  .reaction {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 24px;
    padding: 0 7px 0 5px;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    animation: pop 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
    transition:
      background-color 150ms ease,
      transform 120ms ease;
  }
  .reaction:active:not(:disabled) {
    transform: scale(0.92);
  }
  .reaction:disabled {
    cursor: default;
  }
  .reaction.reaction-mine {
    background: var(--primary);
    color: var(--primary-foreground);
  }
  .reaction.on-mine-bubble {
    background: rgb(255 255 255 / 0.2);
    color: var(--primary-foreground);
  }
  .reaction.on-mine-bubble.reaction-mine {
    background: var(--primary-foreground);
    color: var(--primary);
  }
  .reaction-emoji {
    font-size: 15px;
    line-height: 1;
  }

  @keyframes pop {
    from {
      transform: scale(0.4);
      opacity: 0;
    }
  }

  /* ─── Меню ─── */
  .pick {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 9999px;
    font-size: 19px;
    line-height: 1;
    cursor: pointer;
    transition:
      transform 140ms cubic-bezier(0.34, 1.56, 0.64, 1),
      background-color 140ms ease;
  }
  .pick:hover,
  .pick:focus-visible {
    transform: scale(1.25);
    outline: none;
  }
  .pick.pick-mine {
    background: color-mix(in srgb, var(--primary) 18%, transparent);
  }

  /* Пункти меню — глобальні: Content рендериться в portal, а клас іде
     пропом у компонент bits-ui, тож scoped-стилі до них не дістають. */
  :global(.chat-menu-item) {
    display: flex;
    cursor: pointer;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 12px;
    font-size: 14px;
    outline: none;
    user-select: none;
    transition: background-color 120ms ease;
  }
  :global(.chat-menu-item[data-highlighted]) {
    background: var(--accent);
  }
  :global(.chat-menu-item-danger) {
    color: var(--destructive);
  }
  :global(.chat-menu-item-danger[data-highlighted]) {
    background: color-mix(in srgb, var(--destructive) 10%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .bubble.snap,
    .reaction,
    .pick {
      animation: none;
      transition: none;
    }
  }
</style>
