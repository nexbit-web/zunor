<!-- src/lib/components/chat/message-bubble.svelte -->
<script lang="ts">
  import {
    Check,
    CheckCheck,
    FileText,
    Download,
    Clock,
    AlertCircle,
    MoreVertical,
    Reply,
    Pencil,
    Trash2,
    Copy,
    Briefcase,
  } from 'lucide-svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import type { ChatMessage } from './types'

  interface Props {
    message: ChatMessage
    isMine: boolean
    isLastInGroup: boolean
    showReadStatus: boolean
    isRead: boolean
    isPending?: boolean
    isFailed?: boolean
    /** Підсвітити (для search highlight) */
    isHighlighted?: boolean
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

  function formatSize(bytes: number | null): string {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const radiusClass = $derived(
    isMine
      ? isLastInGroup
        ? 'rounded-2xl rounded-br-md'
        : 'rounded-2xl'
      : isLastInGroup
        ? 'rounded-2xl rounded-bl-md'
        : 'rounded-2xl',
  )

  // Показуємо меню тільки якщо це не pending/failed/deleted і є хоч 1 callback
  const showMenu = $derived(!message.deletedAt && !isPending && !isFailed)

  // Чи можна редагувати: тільки моє TEXT повідомлення в межах 24 годин
  const canEdit = $derived(
    isMine &&
      message.type === 'TEXT' &&
      Date.now() - new Date(message.createdAt).getTime() < 24 * 60 * 60 * 1000,
  )

  function copyText() {
    if (message.text) navigator.clipboard.writeText(message.text)
  }

  // ─── SYSTEM message helpers ───
  // Якщо повідомлення прив'язане до замовлення — Pusher event прокидує orderId.
  // Можемо взяти його з message як додаткове поле (не у типі, але runtime).
  const orderIdFromMessage = $derived(
    (message as any).orderId as string | undefined,
  )

  // Формат: "📝 Створено замовлення" або "📝 Створено замовлення · причина"
  // Виокремлюємо emoji якщо є на початку
  const systemParts = $derived.by(() => {
    if (message.type !== 'SYSTEM') return null
    const text = message.text ?? ''
    // Перші 1-2 символи можуть бути емоджі + пробіл
    const match = text.match(/^(\p{Emoji}+)\s*(.+)$/u)
    if (match) {
      return { icon: match[1], body: match[2] }
    }
    return { icon: null, body: text }
  })
</script>

{#if message.type === 'SYSTEM'}
  <!-- ═══════ SYSTEM повідомлення — центральна плашка ═══════ -->
  <div class="flex justify-center my-3" data-message-id={message.id}>
    {#if orderIdFromMessage}
      <a
        href={`/orders/${orderIdFromMessage}`}
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors hover:opacity-80 cursor-pointer max-w-[90%]"
        style="background-color: var(--muted); color: var(--foreground)"
      >
        {#if systemParts?.icon}
          <span class="text-base leading-none">{systemParts.icon}</span>
        {:else}
          <Briefcase
            class="size-3.5 shrink-0"
            style="color: var(--muted-foreground)"
          />
        {/if}
        <span class="truncate">{systemParts?.body ?? message.text}</span>
      </a>
    {:else}
      <span
        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] max-w-[90%]"
        style="background-color: var(--muted); color: var(--muted-foreground)"
      >
        {#if systemParts?.icon}
          <span class="text-base leading-none">{systemParts.icon}</span>
        {/if}
        <span class="truncate">{systemParts?.body ?? message.text}</span>
      </span>
    {/if}
  </div>
{:else}
  <!-- ═══════ Звичайне повідомлення ═══════ -->
  <div
    class="flex {isMine ? 'justify-end' : 'justify-start'} group"
    data-message-id={message.id}
  >
    <div class="max-w-[75%] sm:max-w-[55%] flex flex-col gap-0.5 relative">
      {#if message.replyTo}
        <div
          class="px-3 py-1.5 rounded-lg mb-1 border-l-2 text-xs leading-tight"
          style="background-color: var(--muted);
                 border-left-color: var(--primary);
                 color: var(--muted-foreground)"
        >
          <p class="font-medium mb-0.5" style="color: var(--foreground)">
            У відповідь на
          </p>
          <p class="line-clamp-2">
            {message.replyTo.type === 'PHOTO'
              ? '📷 Фото'
              : message.replyTo.type === 'FILE'
                ? '📎 Файл'
                : message.replyTo.text || ''}
          </p>
        </div>
      {/if}

      <div class="flex items-end gap-1.5 {isMine ? 'flex-row-reverse' : ''}">
        <!-- Bubble -->
        <div
          class="relative {radiusClass} px-3 py-2 transition-all"
          style={isMine
            ? `background-color: var(--primary); color: var(--primary-foreground); opacity: ${isPending ? 0.7 : 1}; ${isHighlighted ? 'box-shadow: 0 0 0 2px var(--ring);' : ''}`
            : `background-color: var(--muted); color: var(--foreground); opacity: ${isPending ? 0.7 : 1}; ${isHighlighted ? 'box-shadow: 0 0 0 2px var(--ring);' : ''}`}
        >
          {#if message.deletedAt}
            <p
              class="text-sm italic"
              style={isMine ? 'opacity: 0.7' : 'color: var(--muted-foreground)'}
            >
              Повідомлення видалено
            </p>
          {:else if message.type === 'PHOTO' && message.attachmentUrl}
            <a
              href={message.attachmentUrl}
              target="_blank"
              rel="noopener"
              class="block -mx-3 -my-2 mb-1 rounded-2xl overflow-hidden"
            >
              <img
                src={message.attachmentUrl}
                alt={message.text || 'Фото'}
                class="block w-full max-w-sm h-auto object-cover cursor-zoom-in"
                loading="lazy"
              />
            </a>
            {#if message.text}
              <p
                class="text-[14px] leading-snug whitespace-pre-wrap break-words mt-1.5"
                style="overflow-wrap: anywhere"
              >
                {message.text}
              </p>
            {/if}
          {:else if message.type === 'FILE' && message.attachmentUrl}
            <a
              href={message.attachmentUrl}
              target="_blank"
              rel="noopener"
              download={message.attachmentName ?? undefined}
              class="flex items-center gap-3 py-1 group/file"
            >
              <div
                class="size-9 rounded-lg flex items-center justify-center shrink-0"
                style={isMine
                  ? 'background-color: rgba(255,255,255,0.18)'
                  : 'background-color: var(--accent)'}
              >
                <FileText
                  class="size-4"
                  style={isMine
                    ? 'color: white'
                    : 'color: var(--muted-foreground)'}
                />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-medium truncate">
                  {message.attachmentName ?? 'Файл'}
                </p>
                <p
                  class="text-[11px]"
                  style={isMine
                    ? 'color: rgba(255,255,255,0.7)'
                    : 'color: var(--muted-foreground)'}
                >
                  {formatSize(message.attachmentSize)}
                </p>
              </div>
              <Download
                class="size-4 shrink-0 opacity-0 group-hover/file:opacity-100 transition-opacity"
              />
            </a>
            {#if message.text}
              <p
                class="text-[14px] leading-snug whitespace-pre-wrap break-words mt-1"
                style="overflow-wrap: anywhere"
              >
                {message.text}
              </p>
            {/if}
          {:else}
            <p
              class="text-[14px] leading-snug whitespace-pre-wrap break-words"
              style="overflow-wrap: anywhere"
            >
              {message.text}
            </p>
          {/if}

          <div class="flex items-center gap-1 justify-end mt-0.5 -mb-0.5">
            {#if message.editedAt}
              <span
                class="text-[10px] opacity-70"
                style={isMine
                  ? 'color: rgba(255,255,255,0.85)'
                  : 'color: var(--muted-foreground)'}
              >
                ред.
              </span>
            {/if}
            <span
              class="text-[10px] tabular-nums"
              style={isMine
                ? 'color: rgba(255,255,255,0.8)'
                : 'color: var(--muted-foreground)'}
            >
              {time}
            </span>

            {#if isMine}
              {#if isFailed}
                <span title="Не вдалося надіслати" class="inline-flex">
                  <AlertCircle class="size-3" style="color: #ef4444" />
                </span>
              {:else if isPending}
                <span title="Надсилається..." class="inline-flex">
                  <Clock class="size-3" style="color: rgba(255,255,255,0.85)" />
                </span>
              {:else if showReadStatus}
                {#if isRead}
                  <CheckCheck
                    class="size-3"
                    style="color: rgba(255,255,255,0.95)"
                  />
                {:else}
                  <Check class="size-3" style="color: rgba(255,255,255,0.85)" />
                {/if}
              {/if}
            {/if}
          </div>
        </div>

        <!-- Context menu trigger (поряд з bubble) -->
        {#if showMenu}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <div
                role="button"
                tabindex="0"
                class="size-7 rounded-full flex items-center justify-center cursor-pointer transition-all opacity-0 group-hover:opacity-100"
                style="color: var(--muted-foreground); background-color: transparent"
                onmouseenter={(e) =>
                  ((e.currentTarget as HTMLElement).style.backgroundColor =
                    'var(--muted)')}
                onmouseleave={(e) =>
                  ((e.currentTarget as HTMLElement).style.backgroundColor =
                    'transparent')}
                aria-label="Меню повідомлення"
              >
                <MoreVertical class="size-3.5" />
              </div>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align={isMine ? 'end' : 'start'} class="w-44">
              {#if onReply}
                <DropdownMenu.Item
                  class="cursor-pointer gap-2"
                  onclick={() => onReply?.(message)}
                >
                  <Reply class="size-3.5 text-muted-foreground" />
                  <span>Відповісти</span>
                </DropdownMenu.Item>
              {/if}

              {#if message.text}
                <DropdownMenu.Item
                  class="cursor-pointer gap-2"
                  onclick={copyText}
                >
                  <Copy class="size-3.5 text-muted-foreground" />
                  <span>Копіювати</span>
                </DropdownMenu.Item>
              {/if}

              {#if canEdit && onEdit}
                <DropdownMenu.Item
                  class="cursor-pointer gap-2"
                  onclick={() => onEdit?.(message)}
                >
                  <Pencil class="size-3.5 text-muted-foreground" />
                  <span>Редагувати</span>
                </DropdownMenu.Item>
              {/if}

              {#if isMine && onDelete}
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  class="cursor-pointer gap-2 text-destructive focus:text-destructive"
                  onclick={() => onDelete?.(message)}
                >
                  <Trash2 class="size-3.5" />
                  <span>Видалити</span>
                </DropdownMenu.Item>
              {/if}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}
      </div>
    </div>
  </div>
{/if}
