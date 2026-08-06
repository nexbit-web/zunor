<script lang="ts">
  import {
    ArrowUp,
    FileText,
    Image as ImageIcon,
    Paperclip,
    Pencil,
    Reply,
    X,
  } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import type { ChatMessage } from './types'

  // ═══════════════════════ Типи ═══════════════════════

  interface PendingAttachment {
    file: File
    previewUrl: string | null
    type: 'PHOTO' | 'FILE'
  }

  interface UploadedAttachment {
    url: string
    publicId: string
    mimeType: string
    size: number
    name: string
  }

  interface Props {
    chatId: string
    currentUserId: string
    onSendOptimistic?: (msg: ChatMessage) => void
    onSendConfirmed?: (tmpId: string, real: ChatMessage) => void
    onSendFailed?: (tmpId: string, error: string) => void
    /** Edit mode: коли юзер редагує своє повідомлення */
    editing?: ChatMessage | null
    onEditDone?: (m: ChatMessage) => void
    onCancelEdit?: () => void
    replyTo?: ChatMessage | null
    onCancelReply?: () => void
    onTyping?: () => void
  }

  let {
    chatId,
    currentUserId,
    onSendOptimistic,
    onSendConfirmed,
    onSendFailed,
    editing = null,
    onEditDone,
    onCancelEdit,
    replyTo,
    onCancelReply,
    onTyping,
  }: Props = $props()

  // ═══════════════════════ Константи ═══════════════════════

  const MIN_HEIGHT = 40
  const MAX_HEIGHT = 192
  const MAX_FILE_SIZE = 10 * 1024 * 1024
  const MAX_TEXT_LENGTH = 4000
  const PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

  // ═══════════════════════ Стан ═══════════════════════

  let text = $state('')
  let pending = $state<PendingAttachment | null>(null)
  let dragActive = $state(false)

  let textarea = $state<HTMLTextAreaElement | undefined>(undefined)
  let mirror = $state<HTMLDivElement | undefined>(undefined)
  let photoInput = $state<HTMLInputElement | undefined>(undefined)
  let fileInput = $state<HTMLInputElement | undefined>(undefined)

  let height = $state(MIN_HEIGHT)
  let isMultiline = $state(false)

  // ═══════════════════════ Похідні ═══════════════════════

  /**
   * Текст для дзеркала. Хвостовий \n у pre-wrap не створює нового рядка,
   * тому дописуємо пробіл — інакше висота відстає на один рядок.
   */
  const mirrorText = $derived(text.endsWith('\n') ? `${text} ` : text)

  const canSend = $derived(
    editing
      ? text.trim().length > 0
      : text.trim().length > 0 || pending !== null,
  )

  const hasPreview = $derived(!!editing || !!replyTo || !!pending)

  /** Кола ріжуть багаторядковий текст — розгортаємо пілюлю у прямокутник */
  const isExpanded = $derived(hasPreview || isMultiline)

  // ═══════════════════════ Ефекти ═══════════════════════

  /**
   * Вимірюємо приховане дзеркало, а не саму textarea.
   *
   * Класичний трюк (height='auto' → читаємо scrollHeight → ставимо px) ламає
   * CSS-перехід: браузер встигає порахувати стиль з auto, і висота стрибає.
   * Дзеркало має ту саму ширину й типографіку, тож дає те саме число,
   * але без дотику до реального поля.
   */
  $effect(() => {
    if (!mirror) return
    mirrorText // тригер: перерахувати після оновлення DOM дзеркала

    const measured = mirror.scrollHeight
    height = Math.min(Math.max(measured, MIN_HEIGHT), MAX_HEIGHT)
    isMultiline = measured > MIN_HEIGHT + 2
  })

  /** Вхід у режим редагування — підставляємо текст і ставимо курсор у кінець */
  let lastEditingId = ''
  $effect(() => {
    const id = editing?.id ?? ''
    if (id === lastEditingId) return
    lastEditingId = id
    if (!editing) return

    text = editing.text
    clearAttachment() // файли в режимі редагування не підтримуються
    textarea?.focus()
    requestAnimationFrame(() => {
      if (textarea) {
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length
      }
    })
  })

  /** Відкликаємо object URL при розмонтуванні — інакше витік пам'яті */
  $effect(() => {
    return () => {
      if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl)
    }
  })

  // ═══════════════════════ Вкладення ═══════════════════════

  function handleFile(file: File) {
    if (editing) return
    if (file.size > MAX_FILE_SIZE) {
      onSendFailed?.('', 'Файл занадто великий. Максимум 10 МБ.')
      return
    }

    const isPhoto = PHOTO_MIME.includes(file.type)
    const previewUrl = isPhoto ? URL.createObjectURL(file) : null

    if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl)
    pending = { file, previewUrl, type: isPhoto ? 'PHOTO' : 'FILE' }
    textarea?.focus()
  }

  function clearAttachment() {
    if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl)
    pending = null
  }

  function onFileInput(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (file) handleFile(file)
    input.value = '' // щоб повторний вибір того самого файлу спрацював
  }

  function onDragEnter(e: DragEvent) {
    e.preventDefault()
    if (e.dataTransfer?.types.includes('Files') && !editing) dragActive = true
  }

  function onDragLeave(e: DragEvent) {
    const related = e.relatedTarget as Node | null
    if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
      dragActive = false
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    dragActive = false
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }

  function onPaste(e: ClipboardEvent) {
    if (editing) return
    const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
      i.type.startsWith('image/'),
    )
    if (!item) return

    const file = item.getAsFile()
    if (file) {
      e.preventDefault()
      handleFile(file)
    }
  }

  // ═══════════════════════ Завантаження ═══════════════════════

  async function uploadToCloudinary(
    file: File,
    type: 'PHOTO' | 'FILE',
  ): Promise<UploadedAttachment> {
    const resourceType = type === 'PHOTO' ? 'image' : 'raw'

    // kind, а не folder: папку endpoint будує сам із userId,
    // щоб клієнт не міг писати в чужу директорію
    const sigRes = await fetch('/api/upload/signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'chat', resourceType }),
    })
    if (!sigRes.ok) {
      const err = await sigRes.json().catch(() => ({}))
      throw new Error(err.error ?? 'Не вдалося отримати токен завантаження')
    }
    const sig = await sigRes.json()

    const form = new FormData()
    form.append('file', file)
    form.append('api_key', sig.apiKey)
    form.append('timestamp', String(sig.timestamp))
    form.append('signature', sig.signature)
    form.append('folder', sig.folder)

    const upRes = await fetch(
      `https://api.cloudinary.com/v1_1/${sig.cloudName}/${resourceType}/upload`,
      { method: 'POST', body: form },
    )
    if (!upRes.ok) throw new Error('Помилка завантаження файлу')
    const up = await upRes.json()

    return {
      url: up.secure_url,
      publicId: up.public_id,
      mimeType: file.type,
      size: file.size,
      name: file.name,
    }
  }

  // ═══════════════════════ Надсилання ═══════════════════════

  function tmpId(): string {
    return `tmp-${Math.random().toString(36).slice(2, 10)}${Date.now()}`
  }

  async function saveEdit() {
    if (!editing) return

    const trimmed = text.trim()
    if (!trimmed || trimmed === editing.text) {
      onCancelEdit?.()
      return
    }

    try {
      const res = await fetch(`/api/chats/${chatId}/messages/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message ?? 'Не вдалося зберегти')
      }

      const json = await res.json()
      onEditDone?.({ ...editing, text: json.text, editedAt: json.editedAt })
      text = ''
    } catch (err) {
      onSendFailed?.(
        '',
        err instanceof Error ? err.message : 'Помилка збереження',
      )
    }
  }

  async function sendNew() {
    const trimmed = text.trim()
    if (!trimmed && !pending) return

    const id = tmpId()
    const type: 'TEXT' | 'PHOTO' | 'FILE' = pending?.type ?? 'TEXT'
    const currentReplyTo = replyTo
    const currentPending = pending

    const optimistic: ChatMessage = {
      id,
      type,
      text: trimmed,
      attachmentUrl: currentPending?.previewUrl ?? null,
      attachmentMimeType: currentPending?.file.type ?? null,
      attachmentSize: currentPending?.file.size ?? null,
      attachmentName: currentPending?.file.name ?? null,
      isRead: false,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      senderId: currentUserId,
      replyToId: currentReplyTo?.id ?? null,
      replyTo: currentReplyTo
        ? {
            id: currentReplyTo.id,
            text: currentReplyTo.text,
            senderId: currentReplyTo.senderId,
            type: currentReplyTo.type,
          }
        : null,
    }

    onSendOptimistic?.(optimistic)

    // Чистимо поле одразу. previewUrl НЕ відкликаємо — він ще показується
    // в оптимістичному пузирі до підтвердження з сервера.
    text = ''
    pending = null
    onCancelReply?.()
    textarea?.focus()

    try {
      const attachment = currentPending
        ? await uploadToCloudinary(currentPending.file, currentPending.type)
        : null

      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          text: trimmed,
          attachment,
          replyToId: currentReplyTo?.id ?? null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Не вдалося надіслати')
      }

      const json = await res.json()
      onSendConfirmed?.(id, json.message)
    } catch (err) {
      onSendFailed?.(id, err instanceof Error ? err.message : 'Помилка')
    }
  }

  function send() {
    if (editing) saveEdit()
    else sendNew()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && editing) {
      e.preventDefault()
      text = ''
      onCancelEdit?.()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      send()
      return
    }
    onTyping?.()
  }
</script>

<div
  class="relative flex items-end gap-2"
  ondragenter={onDragEnter}
  ondragover={(e) => e.preventDefault()}
  ondragleave={onDragLeave}
  ondrop={onDrop}
  role="region"
  aria-label="Поле вводу"
>
  {#if dragActive}
    <div
      class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-3xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-xl"
    >
      <div class="text-center">
        <ImageIcon class="mx-auto mb-1.5 size-8 text-primary" />
        <p class="text-sm font-medium text-primary">Відпустіть файл</p>
      </div>
    </div>
  {/if}

  <!-- ═══ Скріпка ═══
       Стоїть ЗЗОВНІ поля, окремою кнопкою. Раніше вона жила всередині
       пілюлі й через це поле мусило мати внутрішні відступи під неї;
       тепер пілюля містить лише текст, а обидві дії — по краях рядка. -->
  {#if !editing}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon-lg"
            aria-label="Додати вкладення"
            class="size-10.5 shrink-0 rounded-full border-border/60 bg-card/85 text-muted-foreground shadow-sm backdrop-blur-xl"
          >
            <Paperclip class="size-5" />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>

      <DropdownMenu.Content
        align="start"
        sideOffset={12}
        class="z-50 w-56 rounded-3xl border border-border bg-card p-1.5 shadow-lg"
      >
        <DropdownMenu.Item
          class="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors outline-none select-none hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
          onclick={() => photoInput?.click()}
        >
          <ImageIcon
            class="pointer-events-none size-5 shrink-0 text-muted-foreground"
          />
          <span class="pointer-events-none">Фото або Відео</span>
        </DropdownMenu.Item>

        <DropdownMenu.Item
          class="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors outline-none select-none hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
          onclick={() => fileInput?.click()}
        >
          <FileText
            class="pointer-events-none size-5 shrink-0 text-muted-foreground"
          />
          <span class="pointer-events-none">Файл</span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <input
      bind:this={photoInput}
      type="file"
      accept="image/*"
      onchange={onFileInput}
      class="sr-only"
    />
    <input
      bind:this={fileInput}
      type="file"
      accept="application/pdf,.doc,.docx,.zip,.txt,.xlsx"
      onchange={onFileInput}
      class="sr-only"
    />
  {/if}

  <!-- ═══ Пілюля: превʼю зверху, поле знизу ═══
       Без вертикальних відступів: висота пілюлі = висота поля (40px),
       рівно як у кнопок по боках. Відступи всередині дає сама textarea
       через .composer-metrics. -->
  <div
    class="composer-pill flex min-w-0 flex-1 flex-col border border-border/60 bg-card/85 px-3 text-foreground shadow-sm backdrop-blur-xl"
    class:rounded-3xl={isExpanded}
    class:rounded-full={!isExpanded}
  >
    <!-- ─── Превʼю: редагування / відповідь ─── -->
    {#if editing}
      <div
        class="mt-2 mb-1.5 flex items-center gap-2 rounded-xl border-l-2 border-l-primary bg-muted px-3 py-1.5"
      >
        <Pencil class="size-3.5 shrink-0 text-primary" />
        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-medium text-primary">
            Редагування повідомлення
          </p>
          <p class="truncate text-xs text-muted-foreground">{editing.text}</p>
        </div>
        <button
          type="button"
          onclick={() => {
            text = ''
            onCancelEdit?.()
          }}
          class="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
          aria-label="Скасувати редагування"
        >
          <X class="size-3.5" />
        </button>
      </div>
    {:else if replyTo}
      <div
        class="mt-2 mb-1.5 flex items-center gap-2 rounded-xl border-l-2 border-l-primary bg-muted px-3 py-1.5"
      >
        <Reply class="size-3.5 shrink-0 text-primary" />
        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-medium text-primary">У відповідь</p>
          <p class="truncate text-xs text-muted-foreground">
            {replyTo.type === 'PHOTO'
              ? 'Фото'
              : replyTo.type === 'FILE'
                ? 'Файл'
                : replyTo.text}
          </p>
        </div>
        <button
          type="button"
          onclick={onCancelReply}
          class="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
          aria-label="Скасувати відповідь"
        >
          <X class="size-3.5" />
        </button>
      </div>
    {/if}

    <!-- ─── Превʼю вкладення ─── -->
    {#if pending && !editing}
      <div
        class="mt-2 mb-1.5 flex items-center gap-3 rounded-xl bg-muted px-3 py-1.5"
      >
        {#if pending.previewUrl}
          <img
            src={pending.previewUrl}
            alt=""
            class="size-10 shrink-0 rounded-lg object-cover"
          />
        {:else}
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent"
          >
            <Paperclip class="size-4 text-muted-foreground" />
          </div>
        {/if}
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{pending.file.name}</p>
          <p class="text-[11px] text-muted-foreground">
            {(pending.file.size / 1024 / 1024).toFixed(2)} МБ
          </p>
        </div>
        <button
          type="button"
          onclick={clearAttachment}
          class="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
          aria-label="Видалити вкладення"
        >
          <X class="size-3.5" />
        </button>
      </div>
    {/if}

    <!-- Дзеркало лежить під textarea і має рівно ту саму ширину -->
    <div class="relative min-w-0">
      <div
        bind:this={mirror}
        aria-hidden="true"
        class="composer-metrics pointer-events-none invisible absolute inset-x-0 top-0 wrap-break-word whitespace-pre-wrap"
      >
        {mirrorText}
      </div>

      <textarea
        bind:this={textarea}
        bind:value={text}
        onkeydown={onKeyDown}
        onpaste={onPaste}
        placeholder={editing ? 'Редагувати повідомлення' : 'Повідомлення'}
        rows="1"
        style:height={`${height}px`}
        maxlength={MAX_TEXT_LENGTH}
        class="composer-metrics composer-input block w-full resize-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
      ></textarea>
    </div>
  </div>

  <!-- ═══ Надіслати ═══
       Звичайна кнопка з ui: variant default — це чорне на світлій темі
       й біле на темній. Акцентний колір тут не потрібен: у рядку і так
       одна головна дія, а теракота поруч із пузирями своїх повідомлень
       (вони теж акцентні) читалась як другий такий самий пузир. -->
  <Button
    onclick={send}
    disabled={!canSend}
    size="icon-lg"
    aria-label={editing ? 'Зберегти' : 'Надіслати'}
    class="size-10.5 shrink-0 rounded-full shadow-sm"
  >
    <ArrowUp class="size-5" />
  </Button>
</div>

<style>
  /*
   * Спільна типографіка дзеркала й поля.
   * Будь-яка розбіжність тут = невірний розрахунок висоти,
   * тому обидва елементи беруть цей клас, а не окремі утиліти.
   */
  .composer-metrics {
    display: block;
    box-sizing: border-box;
    padding: 9px 2px;
    font: inherit;
    font-size: 16px;
    line-height: 22px;
    letter-spacing: inherit;
  }

  .composer-input {
    overflow-y: auto;
    /* Анімувати можна тільки тому, що height приходить у px, а не auto */
    transition: height 160ms cubic-bezier(0.4, 0, 0.2, 1);
    /* Скрол працює, смуги не видно */
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .composer-input::-webkit-scrollbar {
    display: none;
  }

  .composer-pill {
    transition: border-radius 200ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  @media (prefers-reduced-motion: reduce) {
    .composer-input,
    .composer-pill {
      transition: none;
    }
  }
</style>
