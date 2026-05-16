<!-- src/lib/components/chat/message-composer.svelte -->
<script lang="ts">
  import {
    Send,
    Plus,
    X,
    Image as ImageIcon,
    Reply,
    Smile,
    Paperclip,
    Pencil,
  } from 'lucide-svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import type { ChatMessage } from './types'

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

  let text = $state('')
  let textarea = $state<HTMLTextAreaElement | undefined>(undefined)
  let pending: PendingAttachment | null = $state(null)
  let dragActive = $state(false)
  let photoInput = $state<HTMLInputElement | undefined>(undefined)
  let fileInput = $state<HTMLInputElement | undefined>(undefined)

  const MAX_SIZE = 10 * 1024 * 1024
  const PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

  // Коли entering edit mode — підвантажуємо текст редагованого
  let lastEditingId = ''
  $effect(() => {
    const id = editing?.id ?? ''
    if (id === lastEditingId) return
    lastEditingId = id
    if (editing) {
      text = editing.text
      // pending attachments чищуть, бо не редагуємо файли
      if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl)
      pending = null
      textarea?.focus()
      // ставимо курсор у кінець
      requestAnimationFrame(() => {
        if (textarea) {
          textarea.selectionStart = textarea.selectionEnd = text.length
        }
      })
    }
  })

  $effect(() => {
    if (!textarea) return
    text
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px'
  })

  function handleFile(file: File) {
    if (editing) return // у edit mode файли не дозволені
    if (file.size > MAX_SIZE) {
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
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) handleFile(file)
    input.value = ''
  }

  function onDragEnter(e: DragEvent) {
    e.preventDefault()
    if (e.dataTransfer?.types.includes('Files') && !editing) dragActive = true
  }

  function onDragLeave(e: DragEvent) {
    const rt = e.relatedTarget as Node | null
    if (!rt || !(e.currentTarget as HTMLElement).contains(rt)) {
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
    if (item) {
      const file = item.getAsFile()
      if (file) {
        e.preventDefault()
        handleFile(file)
      }
    }
  }

  async function uploadToCloudinary(
    file: File,
    type: 'PHOTO' | 'FILE',
  ): Promise<UploadedAttachment> {
    const sigRes = await fetch('/api/upload/signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder: 'zunor/chat',
        resourceType: type === 'PHOTO' ? 'image' : 'raw',
      }),
    })
    if (!sigRes.ok) {
      const err = await sigRes.json().catch(() => ({}))
      throw new Error(err.error ?? 'Не вдалося отримати токен завантаження')
    }
    const sig = await sigRes.json()

    const fd = new FormData()
    fd.append('file', file)
    fd.append('api_key', sig.apiKey)
    fd.append('timestamp', String(sig.timestamp))
    fd.append('signature', sig.signature)
    fd.append('folder', sig.folder)

    const uploadUrl = `https://api.cloudinary.com/v1_1/${sig.cloudName}/${type === 'PHOTO' ? 'image' : 'raw'}/upload`
    const upRes = await fetch(uploadUrl, { method: 'POST', body: fd })
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

  function tmpId(): string {
    return 'tmp-' + Math.random().toString(36).slice(2, 10) + Date.now()
  }

  /** Зберегти редагування */
  async function saveEdit() {
    if (!editing) return
    const trimmed = text.trim()
    if (!trimmed || trimmed === editing.text) {
      onCancelEdit?.()
      return
    }
    try {
      const res = await fetch(
        `/api/chats/${chatId}/messages/${editing.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed }),
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message ?? 'Не вдалося зберегти')
      }
      const json = await res.json()
      const updated: ChatMessage = {
        ...editing,
        text: json.text,
        editedAt: json.editedAt,
      }
      onEditDone?.(updated)
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
    text = ''
    clearAttachment()
    onCancelReply?.()
    textarea?.focus()

    try {
      let attachment: UploadedAttachment | null = null
      if (currentPending) {
        attachment = await uploadToCloudinary(
          currentPending.file,
          currentPending.type,
        )
      }

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
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error ?? 'Не вдалося надіслати')
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

  const canSend = $derived(
    editing ? text.trim().length > 0 : text.trim().length > 0 || pending !== null,
  )
</script>

<div
  class="relative px-4 py-3"
  style="background-color: var(--background);
         border-top: 1px solid var(--border)"
  ondragenter={onDragEnter}
  ondragover={(e) => e.preventDefault()}
  ondragleave={onDragLeave}
  ondrop={onDrop}
  role="region"
  aria-label="Поле вводу"
>
  {#if dragActive}
    <div
      class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
      style="background-color: color-mix(in srgb, var(--primary) 8%, transparent);
             border: 2px dashed var(--primary)"
    >
      <div class="text-center">
        <ImageIcon class="size-8 mx-auto mb-1.5" style="color: var(--primary)" />
        <p class="text-sm font-medium" style="color: var(--primary)">
          Відпустіть файл
        </p>
      </div>
    </div>
  {/if}

  <!-- Edit / Reply preview -->
  {#if editing}
    <div
      class="flex items-center gap-2 px-3 py-2 mb-2 rounded-xl border-l-2"
      style="background-color: var(--muted); border-left-color: var(--primary)"
    >
      <Pencil class="size-3.5 shrink-0" style="color: var(--primary)" />
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-medium" style="color: var(--primary)">
          Редагування повідомлення
        </p>
        <p class="text-xs truncate" style="color: var(--muted-foreground)">
          {editing.text}
        </p>
      </div>
      <button
        type="button"
        onclick={() => {
          text = ''
          onCancelEdit?.()
        }}
        class="size-6 rounded-full flex items-center justify-center cursor-pointer hover:opacity-70"
        aria-label="Скасувати"
      >
        <X class="size-3.5" style="color: var(--muted-foreground)" />
      </button>
    </div>
  {:else if replyTo}
    <div
      class="flex items-center gap-2 px-3 py-2 mb-2 rounded-xl border-l-2"
      style="background-color: var(--muted); border-left-color: var(--primary)"
    >
      <Reply class="size-3.5 shrink-0" style="color: var(--primary)" />
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-medium" style="color: var(--primary)">
          У відповідь
        </p>
        <p class="text-xs truncate" style="color: var(--muted-foreground)">
          {replyTo.type === 'PHOTO'
            ? '📷 Фото'
            : replyTo.type === 'FILE'
              ? '📎 Файл'
              : replyTo.text}
        </p>
      </div>
      <button
        type="button"
        onclick={onCancelReply}
        class="size-6 rounded-full flex items-center justify-center cursor-pointer hover:opacity-70"
        aria-label="Скасувати"
      >
        <X class="size-3.5" style="color: var(--muted-foreground)" />
      </button>
    </div>
  {/if}

  {#if pending && !editing}
    <div
      class="flex items-center gap-3 px-3 py-2 mb-2 rounded-xl"
      style="background-color: var(--muted)"
    >
      {#if pending.previewUrl}
        <img
          src={pending.previewUrl}
          alt=""
          class="size-10 rounded-lg object-cover shrink-0"
        />
      {:else}
        <div
          class="size-10 rounded-lg flex items-center justify-center shrink-0"
          style="background-color: var(--accent)"
        >
          <Paperclip class="size-4" style="color: var(--muted-foreground)" />
        </div>
      {/if}
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate" style="color: var(--foreground)">
          {pending.file.name}
        </p>
        <p class="text-[11px]" style="color: var(--muted-foreground)">
          {(pending.file.size / 1024 / 1024).toFixed(2)} МБ
        </p>
      </div>
      <button
        type="button"
        onclick={clearAttachment}
        class="size-7 rounded-full flex items-center justify-center cursor-pointer hover:opacity-70"
        aria-label="Видалити"
      >
        <X class="size-3.5" style="color: var(--muted-foreground)" />
      </button>
    </div>
  {/if}

  <div class="flex items-end gap-2">
    {#if !editing}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <div
            class="size-9 rounded-full flex items-center justify-center cursor-pointer transition-colors"
            style="background-color: var(--muted); color: var(--muted-foreground)"
          >
            <Plus class="size-4" />
          </div>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start" class="w-44">
          <DropdownMenu.Item
            class="cursor-pointer gap-2"
            onclick={() => photoInput?.click()}
          >
            <ImageIcon class="size-3.5 text-muted-foreground" />
            <span>Фото</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            class="cursor-pointer gap-2"
            onclick={() => fileInput?.click()}
          >
            <Paperclip class="size-3.5 text-muted-foreground" />
            <span>Файл</span>
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

    <textarea
      bind:this={textarea}
      bind:value={text}
      onkeydown={onKeyDown}
      onpaste={onPaste}
      placeholder={editing ? 'Редагувати повідомлення' : 'Написати повідомлення'}
      rows="1"
      class="flex-1 min-w-0 resize-none px-4 py-2 rounded-3xl outline-none text-[14px] leading-snug"
      style="background-color: var(--muted); color: var(--foreground); max-height: 160px"
      maxlength={4000}
    ></textarea>

    {#if canSend}
      <button
        type="button"
        onclick={send}
        class="size-9 shrink-0 rounded-full flex items-center justify-center cursor-pointer transition-all"
        style="background-color: var(--primary); color: var(--primary-foreground)"
        aria-label={editing ? 'Зберегти' : 'Надіслати'}
      >
        {#if editing}
          <Pencil class="size-4" />
        {:else}
          <Send class="size-4" />
        {/if}
      </button>
    {:else}
      <button
        type="button"
        class="size-9 shrink-0 rounded-full flex items-center justify-center cursor-not-allowed transition-colors"
        style="background-color: var(--muted); color: var(--muted-foreground)"
        aria-label="Емодзі"
        disabled
      >
        <Smile class="size-4" />
      </button>
    {/if}
  </div>
</div>