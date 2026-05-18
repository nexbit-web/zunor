<!-- src/lib/components/avatar-uploader.svelte -->
<script lang="ts">
  import * as Avatar from '$lib/components/ui/avatar'
  import { Camera } from 'lucide-svelte'
  import { Spinner } from './ui/spinner'

  let {
    value = $bindable(''),
    publicId = $bindable(''),
    fallback = '?',
    uploading = $bindable(false),
    onError,
  }: {
    value?: string
    publicId?: string
    fallback?: string
    uploading?: boolean
    onError?: (msg: string) => void
  } = $props()

  let fileInput = $state<HTMLInputElement>()
  let error = $state('')

  const MAX_MB = 5

  async function handleChange(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      error = 'Тільки зображення'
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      const msg = `Аватар має бути менше ${MAX_MB} МБ`
      error = msg
      onError?.(msg)
      input.value = ''
      return
    }

    error = ''
    uploading = true

    try {
      // 1. Підпис (сервер поверне фіксований publicId для overwrite)
      const sigRes = await fetch('/api/upload/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'avatar', resourceType: 'image' }),
      })
      if (!sigRes.ok) {
        const err = await sigRes.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Не вдалось отримати підпис')
      }
      const sig = await sigRes.json()

      // 2. Upload на Cloudinary з overwrite
      const fd = new FormData()
      fd.append('file', file)
      fd.append('api_key', sig.apiKey)
      fd.append('timestamp', String(sig.timestamp))
      fd.append('signature', sig.signature)
      fd.append('folder', sig.folder)
      if (sig.publicId) {
        fd.append('public_id', sig.publicId)
        fd.append('overwrite', 'true')
      }

      const upRes = await fetch(
        `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
        { method: 'POST', body: fd },
      )
      if (!upRes.ok) {
        const upErr = await upRes.json().catch(() => ({}))
        throw new Error(upErr?.error?.message ?? 'Помилка завантаження')
      }

      const json = await upRes.json()
      value = json.secure_url
      publicId = json.public_id
    } catch (err) {
      console.error('[avatar-uploader]', err)
      const msg =
        err instanceof Error ? err.message : 'Не вдалось завантажити аватар'
      error = msg
      onError?.(msg)
    } finally {
      uploading = false
      if (fileInput) fileInput.value = ''
    }
  }
</script>

<div class="inline-flex flex-col items-center gap-2">
  <button
    type="button"
    onclick={() => fileInput?.click()}
    disabled={uploading}
    class="relative group rounded-full cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed"
    aria-label="Завантажити аватар"
  >
    <Avatar.Root
      class="size-24 ring-4 shadow-md"
      style="--tw-ring-color: var(--card)"
    >
      {#if value}
        <Avatar.Image src={value} alt="avatar" />
      {/if}
      <Avatar.Fallback
        class="text-2xl font-semibold"
        style="background-color: color-mix(in oklch, var(--primary) 12%, var(--card));
               color: var(--primary)"
      >
        {fallback}
      </Avatar.Fallback>
    </Avatar.Root>

    <div
      class="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
      style="background-color: rgba(0,0,0,0.45)"
    >
      {#if uploading}
        <Spinner />
      {:else}
        <Camera class="size-5 text-white" />
      {/if}
    </div>

    {#if uploading}
      <div
        class="absolute inset-0 rounded-full flex items-center justify-center pointer-events-none"
        style="background-color: rgba(0,0,0,0.45)"
      >
        <Spinner />
      </div>
    {/if}
  </button>

  {#if error}
    <span
      class="text-xs text-center max-w-[10rem]"
      style="color: var(--destructive)"
    >
      {error}
    </span>
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    onchange={handleChange}
    class="hidden"
    disabled={uploading}
  />
</div>
