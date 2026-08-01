<!-- src/lib/components/chat/message-bubble.svelte -->
<script lang="ts">
  import {
    AlertCircle,
    Check,
    CheckCheck,
    Clock,
    Copy,
    Download,
    FileText,
    MoreVertical,
    Pencil,
    Reply,
    Trash2,
  } from 'lucide-svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import type { ChatMessage } from './types'
  import toast from 'svelte-hot-french-toast'

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
    /** Імʼя автора цитованого повідомлення */
    replyAuthorName?: string
    onReply?: (m: ChatMessage) => void
    onEdit?: (m: ChatMessage) => void
    onDelete?: (m: ChatMessage) => void
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
    replyAuthorName = '',
    onReply,
    onEdit,
    onDelete,
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

  // Варіанти кольору тримаємо тут, а не в розмітці:
  // інакше кожен вкладений елемент обростає своїм тернарником
  const bubbleTone = $derived(
    isMine ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground',
  )
  const metaTone = $derived(
    isMine ? 'text-primary-foreground/75' : 'text-muted-foreground',
  )
  const quoteTone = $derived(
    isMine ? 'border-white/80 bg-white/15' : 'border-primary bg-primary/10',
  )
  const quoteAuthorTone = $derived(isMine ? 'text-white' : 'text-primary')
  const tintTone = $derived(isMine ? 'bg-white/15' : 'bg-primary/10')

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
    return message.replyTo.text
  }

  function copyText() {
    if (message.text) navigator.clipboard.writeText(message.text)
    toast.success('Скопійовано', { duration: 2000 })
  }
</script>

<div
  class="group flex {isMine ? 'justify-end' : 'justify-start'} {isLastInGroup
    ? 'mb-2.5'
    : 'mb-0.5'}"
  data-message-id={message.id}
>
  <div
    class="flex max-w-[min(70%,480px)] items-end gap-1 {isMine
      ? 'flex-row-reverse'
      : ''}"
  >
    <div
      class="relative w-fit max-w-full rounded-xl px-2.5 py-1.5 text-[15px] leading-5 shadow-sm {bubbleTone}"
      class:rounded-bl-none={isLastInGroup && !isMine}
      class:rounded-br-none={isLastInGroup && isMine}
      class:tail-in={isLastInGroup && !isMine}
      class:tail-out={isLastInGroup && isMine}
      class:opacity-70={isPending}
      class:ring-2={isHighlighted}
      class:ring-ring={isHighlighted}
      class:overflow-hidden={isPhoto}
      class:p-[3px]={isPhoto}
    >
      <!-- ─── Цитата ─── -->
      {#if message.replyTo}
        <div
          class="mb-1 rounded border-l-[3px] px-2 py-0.5 text-[13px] leading-[17px] {quoteTone}"
        >
          {#if replyAuthorName}
            <span class="block font-semibold {quoteAuthorTone}">
              {replyAuthorName}
            </span>
          {/if}
          <span class="line-clamp-1 opacity-85">{replyPreview()}</span>
        </div>
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
        <a
          href={message.attachmentUrl}
          target="_blank"
          rel="noopener"
          class="block overflow-hidden rounded-[10px]"
        >
          <img
            src={message.attachmentUrl}
            alt={message.text || 'Фото'}
            loading="lazy"
            class="block h-auto w-full max-w-80 cursor-zoom-in object-cover"
          />
        </a>

        {#if message.text}
          <p class="m-0 px-1.5 pt-1 pb-px break-words whitespace-pre-wrap">
            {message.text}<span
              class="meta float-right ml-2.5 inline-flex items-center gap-[3px] pt-1.5 text-[11px] leading-3 whitespace-nowrap select-none {metaTone}"
            >
              {#if message.editedAt}<span class="italic">ред.</span>{/if}
              <span class="tabular-nums">{time}</span>
              {#if isMine}
                {#if isFailed}
                  <AlertCircle class="size-3.5 shrink-0 text-destructive" />
                {:else if isPending}
                  <Clock class="size-3.5 shrink-0" />
                {:else if showReadStatus && isRead}
                  <CheckCheck class="size-3.5 shrink-0" />
                {:else if showReadStatus}
                  <Check class="size-3.5 shrink-0" />
                {/if}
              {/if}
            </span>
          </p>
        {:else}
          <!-- Без підпису час лягає плашкою поверх знімка -->
          <span
            class="absolute right-2.5 bottom-2.5 inline-flex items-center gap-[3px] rounded-full bg-black/45 px-2 py-0.5 text-[11px] leading-3 whitespace-nowrap text-white backdrop-blur-sm select-none"
          >
            <span class="tabular-nums">{time}</span>
            {#if isMine}
              {#if isFailed}
                <AlertCircle class="size-3.5 shrink-0 text-destructive" />
              {:else if isPending}
                <Clock class="size-3.5 shrink-0" />
              {:else if showReadStatus && isRead}
                <CheckCheck class="size-3.5 shrink-0" />
              {:else if showReadStatus}
                <Check class="size-3.5 shrink-0" />
              {/if}
            {/if}
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

        <p class="m-0 pt-1 break-words whitespace-pre-wrap">
          {message.text}<span
            class="meta float-right ml-2.5 inline-flex items-center gap-[3px] pt-1.5 text-[11px] leading-3 whitespace-nowrap select-none {metaTone}"
          >
            {#if message.editedAt}<span class="italic">ред.</span>{/if}
            <span class="tabular-nums">{time}</span>
            {#if isMine}
              {#if isFailed}
                <AlertCircle class="size-3.5 shrink-0 text-destructive" />
              {:else if isPending}
                <Clock class="size-3.5 shrink-0" />
              {:else if showReadStatus && isRead}
                <CheckCheck class="size-3.5 shrink-0" />
              {:else if showReadStatus}
                <Check class="size-3.5 shrink-0" />
              {/if}
            {/if}
          </span>
        </p>
      {:else}
        <!-- float підбирає час у той самий рядок, де закінчився текст;
             не влазить — браузер сам зносить його нижче -->
        <p class="m-0 break-words whitespace-pre-wrap">
          {message.text}<span
            class="meta float-right ml-2.5 inline-flex items-center gap-[3px] pt-1.5 text-[11px] leading-3 whitespace-nowrap select-none {metaTone}"
          >
            {#if message.editedAt}<span class="italic">ред.</span>{/if}
            <span class="tabular-nums">{time}</span>
            {#if isMine}
              {#if isFailed}
                <AlertCircle class="size-3.5 shrink-0 text-destructive" />
              {:else if isPending}
                <Clock class="size-3.5 shrink-0" />
              {:else if showReadStatus && isRead}
                <CheckCheck class="size-3.5 shrink-0" />
              {:else if showReadStatus}
                <Check class="size-3.5 shrink-0" />
              {/if}
            {/if}
          </span>
        </p>
      {/if}
    </div>

    <!-- ─── Меню ─── -->
    {#if showMenu}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <div
            role="button"
            tabindex="0"
            aria-label="Меню повідомлення"
            class="flex size-6.5 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black/25 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <MoreVertical class="size-4" />
          </div>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          align={isMine ? 'end' : 'start'}
          class="z-50 w-48 rounded-2xl border border-border bg-card p-1.5 shadow-lg"
        >
          {#if onReply}
            <DropdownMenu.Item
              class="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors outline-none hover:bg-accent data-highlighted:bg-accent"
              onclick={() => onReply?.(message)}
            >
              <Reply class="size-4 text-muted-foreground" />
              <span>Відповісти</span>
            </DropdownMenu.Item>
          {/if}

          {#if message.text}
            <DropdownMenu.Item
              class="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors outline-none hover:bg-accent data-highlighted:bg-accent"
              onclick={copyText}
            >
              <Copy class="size-4 text-muted-foreground" />
              <span>Копіювати</span>
            </DropdownMenu.Item>
          {/if}

          {#if canEdit && onEdit}
            <DropdownMenu.Item
              class="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors outline-none hover:bg-accent data-highlighted:bg-accent"
              onclick={() => onEdit?.(message)}
            >
              <Pencil class="size-4 text-muted-foreground" />
              <span>Редагувати</span>
            </DropdownMenu.Item>
          {/if}

          {#if isMine && onDelete}
            <DropdownMenu.Separator class="my-1 h-px bg-border" />
            <DropdownMenu.Item
              class="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-destructive transition-colors outline-none hover:bg-destructive/10 data-highlighted:bg-destructive/10"
              onclick={() => onDelete?.(message)}
            >
              <Trash2 class="size-4" />
              <span>Видалити</span>
            </DropdownMenu.Item>
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}
  </div>
</div>

<style>
  /*
   * Хвостик. Єдине, що лишилось у CSS: маска з radial-gradient в Tailwind
   * записується як [mask:radial-gradient(circle_20px_at_0_0,...)] — о третій
   * ночі таке не читається.
   *
   * bg-inherit бере колір самого пузиря, тому варіант in/out не дублюється.
   * right/left зсунуті так, щоб хвіст заходив на 3px ПІД пузир — інакше на
   * стику лишається волосяна щілина.
   */
  .tail-in::after,
  .tail-out::after {
    content: '';
    position: absolute;
    bottom: 0;
    width: 14px;
    height: 20px;
    background-color: inherit;
    pointer-events: none;
  }

  .tail-in::after {
    left: -11px;
    -webkit-mask: radial-gradient(circle 20px at 0 0, transparent 0 19.5px, #000 20px);
    mask: radial-gradient(circle 20px at 0 0, transparent 0 19.5px, #000 20px);
  }

  .tail-out::after {
    right: -11px;
    -webkit-mask: radial-gradient(circle 20px at 100% 0, transparent 0 19.5px, #000 20px);
    mask: radial-gradient(circle 20px at 100% 0, transparent 0 19.5px, #000 20px);
  }

  /* Час має сідати на базову лінію останнього рядка, а не над нею */
  .meta {
    margin-top: 6px;
  }
</style>