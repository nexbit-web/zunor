<script lang="ts">
  import Check from '$lib/components/icons/set/check.svelte'
  import FileText from '$lib/components/icons/set/file-text.svelte'
  import ImageIcon from '$lib/components/icons/set/image.svelte'
  import Paperclip from '$lib/components/icons/set/paperclip.svelte'
  import Pencil from '$lib/components/icons/set/pencil.svelte'
  import Reply from '$lib/components/icons/set/reply.svelte'
  import Send from '$lib/components/icons/set/send.svelte'
  import X from '$lib/components/icons/set/x.svelte'
  import { tick, untrack } from 'svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { chatDrafts } from './drafts.svelte'
  import EmojiPicker from './emoji-picker.svelte'
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
    /** ↑ у порожньому полі — правити своє останнє, як у Telegram. */
    onEditLast?: () => void
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
    onEditLast,
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

  // ═══════════════════════ Чернетка ═══════════════════════

  /**
   * Своя чернетка в кожному чаті. Поле одне на всі чати (вікно не
   * перемонтовується при переході), тож при зміні чату текст береться з
   * чернетки нового, а не їде з попереднього.
   */
  let draftChatId = ''
  $effect(() => {
    const id = chatId
    if (id === draftChatId) return
    draftChatId = id
    untrack(() => {
      text = chatDrafts.get(currentUserId, id)
      clearAttachment()
    })
  })

  /** Пишемо лише з введення: правка повідомлення — не чернетка. */
  function saveDraft() {
    if (!editing) chatDrafts.set(currentUserId, chatId, text)
  }

  /** Після редагування повертаємо недописане, як було до нього. */
  function restoreDraft() {
    text = chatDrafts.get(currentUserId, chatId)
  }

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
      restoreDraft()
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
      onEditDone?.({
        ...editing,
        text: json.text,
        editedAt: json.editedAt,
        linkPreview: json.linkPreview ?? null,
      })
      restoreDraft()
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
      reactions: [],
      linkPreview: null,
    }

    onSendOptimistic?.(optimistic)

    // Чистимо поле одразу. previewUrl НЕ відкликаємо — він ще показується
    // в оптимістичному пузирі до підтвердження з сервера.
    text = ''
    chatDrafts.set(currentUserId, chatId, '')
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

  /** Клік по капсулі повз кнопки — курсор у поле, каретку не збиваємо. */
  function focusFromShell(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button, a, input, textarea')) return
    e.preventDefault()
    textarea?.focus()
  }

  /** Емодзі стає туди, де курсор (або замість виділеного), як у Telegram. */
  async function insertEmoji(emoji: string) {
    const el = textarea
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    if (text.length - (end - start) + emoji.length > MAX_TEXT_LENGTH) return

    text = text.slice(0, start) + emoji + text.slice(end)
    saveDraft()
    onTyping?.()

    await tick()
    if (!el) return
    // На телефоні фокус підняв би клавіатуру поверх панелі емодзі.
    if (!matchMedia('(pointer: coarse)').matches) el.focus()
    el.selectionStart = el.selectionEnd = start + emoji.length
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && editing) {
      e.preventDefault()
      restoreDraft()
      onCancelEdit?.()
      return
    }
    if (e.key === 'Escape' && replyTo) {
      e.preventDefault()
      onCancelReply?.()
      return
    }
    if (e.key === 'ArrowUp' && !text && !editing && !pending) {
      e.preventDefault()
      onEditLast?.()
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

<!--
  Поле вводу — одна монолітна капсула, як у чаті з Zunor
  (/dashboard/jobs/new): скріпка · текст · емодзі · «Надіслати». Окремих
  кнопок поза нею немає. «Надіслати» зʼявляється всередині, лише коли є
  що надсилати, і текст плавно поступається їй місцем.
-->
<div
  class="relative"
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

  <!-- ═══ Капсула: превʼю зверху, рядок вводу знизу ═══
       Рядок — висота поля (40px) плюс p-1, кнопки в ньому по 40px.
       Клік по порожньому місцю капсули ставить курсор у поле, як і в
       чаті з Zunor. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="composer-pill flex min-w-0 cursor-text flex-col border border-border/60 bg-card/85 text-foreground shadow-sm backdrop-blur-xl"
    onmousedown={focusFromShell}
  >
    <!-- ─── Превʼю: редагування / відповідь ─── -->
    {#if editing}
      <div
        class="mx-2 mt-2 mb-0.5 flex items-center gap-2 rounded-xl border-l-2 border-l-primary bg-muted px-3 py-1.5"
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
            restoreDraft()
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
        class="mx-2 mt-2 mb-0.5 flex items-center gap-2 rounded-xl border-l-2 border-l-primary bg-muted px-3 py-1.5"
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
        class="mx-2 mt-2 mb-0.5 flex items-center gap-3 rounded-xl bg-muted px-3 py-1.5"
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

    <!-- ─── Рядок вводу: скріпка · текст · емодзі · надіслати ─── -->
    <div class="flex items-end p-[3px]">
      {#if !editing}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                aria-label="Додати вкладення"
                class="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground data-[state=open]:text-foreground"
              >
                <Paperclip class="size-5.5" />
              </button>
            {/snippet}
          </DropdownMenu.Trigger>

          <!-- Меню як у Telegram: компактна картка без контуру (ring і
               border бібліотеки вимкнені), іконка контуром у колір тексту.
               Клас рядка — один на всі пункти. -->
          <DropdownMenu.Content
            align="start"
            sideOffset={10}
            class="z-50 w-52 rounded-[14px] border-0 bg-card/90 p-1 shadow-lg ring-0 backdrop-blur-xl"
          >
            <DropdownMenu.Item
              class="chat-attach-item"
              onclick={() => photoInput?.click()}
            >
              <ImageIcon
                class="pointer-events-none size-4.5 shrink-0"
                strokeWidth={1.75}
              />
              <span class="pointer-events-none">Фото або відео</span>
            </DropdownMenu.Item>

            <DropdownMenu.Item
              class="chat-attach-item"
              onclick={() => fileInput?.click()}
            >
              <FileText
                class="pointer-events-none size-4.5 shrink-0"
                strokeWidth={1.75}
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

      <!-- Дзеркало лежить під textarea і має рівно ту саму ширину -->
      <div class="relative min-w-0 flex-1" class:pl-3={editing}>
        <div
          bind:this={mirror}
          aria-hidden="true"
          class="composer-metrics pointer-events-none invisible absolute inset-x-0 top-0 wrap-break-word whitespace-pre-wrap"
          class:left-3={editing}
        >
          {mirrorText}
        </div>

        <textarea
          bind:this={textarea}
          bind:value={text}
          onkeydown={onKeyDown}
          oninput={saveDraft}
          onpaste={onPaste}
          placeholder={editing ? 'Редагувати повідомлення' : 'Повідомлення'}
          rows="1"
          style:height={`${height}px`}
          maxlength={MAX_TEXT_LENGTH}
          class="composer-metrics composer-input block w-full resize-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        ></textarea>
      </div>

      <EmojiPicker onPick={insertEmoji} />

      <!-- ═══ Надіслати ═══
           Акцентна, як у чаті з Zunor: єдина головна дія рядка, і поки
           надсилати нічого, її просто немає (а не сіра «вимкнена»).
           mousedown без фокуса — щоб на телефоні після відправки не
           ховалась клавіатура. -->
      <div class="send-slot" class:send-slot-open={canSend}>
        <button
          type="button"
          onclick={send}
          onmousedown={(e) => e.preventDefault()}
          disabled={!canSend}
          tabindex={canSend ? 0 : -1}
          aria-label={editing ? 'Зберегти' : 'Надіслати'}
          class="send"
        >
          {#if editing}
            <Check class="size-5" strokeWidth={2.75} />
          {:else}
            <Send class="size-5" strokeWidth={2} />
          {/if}
        </button>
      </div>
    </div>
  </div>
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

  /* Рядок меню скріпки: пропорції Telegram відносно поля вводу — 36px
     заввишки, іконка 18px і ~18px до підпису, підсвітка заокругленою
     плашкою всередині картки. */
  :global(.chat-attach-item) {
    display: flex;
    width: 100%;
    height: 2.25rem;
    align-items: center;
    gap: 1.125rem;
    padding: 0 0.75rem;
    border-radius: 0.625rem;
    font-size: 14.5px;
    font-weight: 600;
    cursor: pointer;
    outline: none;
    user-select: none;
    transition: background-color 120ms ease;
  }
  :global(.chat-attach-item[data-highlighted]) {
    background-color: var(--muted);
  }

  /*
   * Радіус = половина висоти капсули в один рядок (40 + 3px полів + рамка
   * = 48px, як і шапка): тоді це повна пілюля, а коли поле росте чи зверху превʼю —
   * той самий кут, лише прямокутник довшає. Перемикати rounded-full ↔
   * rounded-3xl не треба: перехід від 9999px до 24px анімується ривком у
   * самому кінці.
   */
  .composer-pill {
    border-radius: 24px;
  }

  /*
   * Місце під «Надіслати» всередині капсули росте з нуля — текст плавно
   * поступається, а не відскакує. Сама кнопка прибита до правого краю
   * місця й «вистрибує» пружиною з легким поворотом стрілки.
   */
  .send-slot {
    position: relative;
    flex-shrink: 0;
    width: 0;
    height: 2.5rem;
    transition: width 280ms cubic-bezier(0.32, 0.72, 0, 1);
  }

  .send-slot-open {
    width: 2.5rem;
  }

  .send {
    position: absolute;
    right: 0.125rem;
    bottom: 0.125rem;
    display: flex;
    width: 2.25rem;
    height: 2.25rem;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background-color: var(--primary);
    color: var(--primary-foreground);
    cursor: pointer;
    opacity: 0;
    transform: scale(0.4) rotate(-45deg);
    pointer-events: none;
    transition:
      transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1),
      opacity 160ms ease,
      background-color 150ms ease;
  }

  .send-slot-open .send {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }

  .send:hover {
    background-color: var(--primary-hover, var(--primary));
  }

  .send:active {
    transform: scale(0.9);
    transition-duration: 90ms;
  }

  .send:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .composer-input,
    .send-slot,
    .send {
      transition: none;
    }
  }
</style>
