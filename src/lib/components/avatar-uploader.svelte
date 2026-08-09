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

<div class="inline-flex flex-col items-start gap-2">
  <button
    type="button"
    onclick={() => fileInput?.click()}
    disabled={uploading}
    class="group relative cursor-pointer rounded-full transition-transform focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring active:scale-[0.98] disabled:cursor-not-allowed"
    aria-label={value ? 'Змінити фото' : 'Завантажити фото'}
  >
    <Avatar.Root class="size-20">
      {#if value}
        <Avatar.Image src={value} alt="" class="object-cover" />
      {/if}
      <Avatar.Fallback
        class="bg-muted text-xl font-medium text-muted-foreground"
      >
        {fallback}
      </Avatar.Fallback>
    </Avatar.Root>

    <!-- Значок камери завжди видимий, а не лише на ховері: без нього
         незрозуміло, що аватар клікабельний, — люди просто не знають,
         що сюди можна натиснути. На ховері він темнішає.
         ring кольором фону відділяє значок від фото. -->
    <span
      class="absolute -right-0.5 -bottom-0.5 flex size-7 items-center justify-center rounded-full bg-foreground text-background ring-2 ring-background transition-colors group-hover:bg-foreground/85"
      aria-hidden="true"
    >
      {#if uploading}
        <Spinner class="size-3.5 animate-spin" />
      {:else}
        <Camera class="size-3.5" strokeWidth={2} />
      {/if}
    </span>

    <!-- Під час завантаження гасимо фото, щоб було видно, що йде процес -->
    {#if uploading}
      <span
        class="pointer-events-none absolute inset-0 rounded-full bg-background/60"
        aria-hidden="true"
      ></span>
    {/if}
  </button>

  <span class="text-[12px] text-muted-foreground">
    {#if uploading}
      Завантажуємо...
    {:else if value}
      Натисніть, щоб змінити
    {:else}
      Натисніть, щоб додати
    {/if}
  </span>

  {#if error}
    <span class="max-w-[14rem] text-[12px] text-destructive" role="alert">
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
