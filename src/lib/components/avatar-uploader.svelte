<!-- src/lib/components/avatar-uploader.svelte -->
<script lang="ts">
  import * as Avatar from '$lib/components/ui/avatar'
  import { Camera, Loader2, User } from 'lucide-svelte'

  interface Props {
    value?: string
    fallback: string
    label?: string
    onupload?: (url: string) => void
    /**
     * 'circle' — класичний круглий аватар (маленький / середній)
     * 'cover' — заповнює батьківський контейнер (велике квадратне фото в карточці)
     */
    variant?: 'circle' | 'cover'
    size?: 'md' | 'lg' | 'xl'
  }

  let {
    value = $bindable(),
    fallback,
    label,
    onupload,
    variant = 'circle',
    size = 'lg',
  }: Props = $props()

  let fileInput = $state<HTMLInputElement>()
  let loading = $state(false)
  let error = $state('')

  const sizeClass = {
    md: 'size-16',
    lg: 'size-24',
    xl: 'size-32',
  }[size]

  async function handleFile(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      error = 'Тільки зображення'
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      error = 'Файл має бути до 5 МБ'
      return
    }

    error = ''
    loading = true

    try {
      // 1. підпис
      const sigRes = await fetch('/api/upload/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'avatar' }),
      })
      if (!sigRes.ok) throw new Error('sign')
      const { timestamp, signature, apiKey, cloudName, folder } =
        await sigRes.json()

      // 2. upload в Cloudinary
      const form = new FormData()
      form.append('file', file)
      form.append('api_key', apiKey)
      form.append('timestamp', String(timestamp))
      form.append('signature', signature)
      form.append('folder', folder)

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: 'POST', body: form },
      )
      if (!uploadRes.ok) throw new Error('upload')
      const uploaded = await uploadRes.json()
      const url: string = uploaded.secure_url
      const publicId: string = uploaded.public_id

      // 3. зберегти в БД (з видаленням старого фото)
      const saveRes = await fetch('/api/user/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'avatar', url, publicId }),
      })
      if (!saveRes.ok) throw new Error('save')

      value = url
      onupload?.(url)
    } catch {
      error = 'Не вдалось завантажити. Спробуйте ще раз.'
    } finally {
      loading = false
      if (fileInput) fileInput.value = ''
    }
  }
</script>

{#if variant === 'cover'}
  <!-- ════ COVER VARIANT — заповнює батьківський квадрат ════ -->
  <button
    type="button"
    onclick={() => fileInput?.click()}
    disabled={loading}
    class="group absolute inset-0 w-full h-full cursor-pointer"
    aria-label="Завантажити фото профілю"
  >
    {#if value}
      <img
        src={value}
        alt="profile"
        class="w-full h-full object-cover"
      />
    {:else}
      <div
        class="w-full h-full flex flex-col items-center justify-center gap-3"
        style="background-color: color-mix(in oklch, var(--foreground) 4%, transparent)"
      >
        <div
          class="size-14 rounded-full flex items-center justify-center transition-colors"
          style="background-color: color-mix(in oklch, var(--foreground) 6%, transparent)"
        >
          {#if loading}
            <Loader2
              class="size-6 animate-spin"
              style="color: var(--muted-foreground)"
            />
          {:else}
            <Camera
              class="size-6"
              style="color: var(--muted-foreground)"
            />
          {/if}
        </div>
        <span
          class="text-xs font-medium"
          style="color: var(--muted-foreground)"
        >
          {loading ? 'Завантаження…' : 'Завантажити фото'}
        </span>
      </div>
    {/if}

    <!-- overlay при наведенні, тільки якщо є фото -->
    {#if value}
      <div
        class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style="background-color: rgba(0,0,0,0.45)"
      >
        {#if loading}
          <Loader2 class="size-6 animate-spin text-white" />
        {:else}
          <div class="flex flex-col items-center gap-1.5">
            <Camera class="size-6 text-white" />
            <span class="text-xs font-medium text-white">
              Змінити фото
            </span>
          </div>
        {/if}
      </div>

      {#if loading}
        <div
          class="absolute inset-0 flex items-center justify-center"
          style="background-color: rgba(0,0,0,0.45)"
        >
          <Loader2 class="size-6 animate-spin text-white" />
        </div>
      {/if}
    {/if}

    {#if error}
      <div
        class="absolute bottom-3 left-3 right-3 px-3 py-2 rounded-lg text-xs text-center"
        style="background-color: var(--destructive); color: var(--primary-foreground)"
      >
        {error}
      </div>
    {/if}

    <input
      bind:this={fileInput}
      type="file"
      accept="image/*"
      onchange={handleFile}
      class="hidden"
    />
  </button>
{:else}
  <!-- ════ CIRCLE VARIANT — маленький круглий ════ -->
  <div class="inline-flex flex-col items-center gap-2">
    <button
      type="button"
      onclick={() => fileInput?.click()}
      disabled={loading}
      class="relative group rounded-full cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
      aria-label="Завантажити аватар"
    >
      <Avatar.Root
        class="{sizeClass} ring-4 shadow-md"
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
        {#if loading}
          <Loader2 class="size-5 animate-spin text-white" />
        {:else}
          <Camera class="size-5 text-white" />
        {/if}
      </div>

      {#if loading}
        <div
          class="absolute inset-0 rounded-full flex items-center justify-center pointer-events-none"
          style="background-color: rgba(0,0,0,0.45)"
        >
          <Loader2 class="size-5 animate-spin text-white" />
        </div>
      {/if}
    </button>

    {#if label}
      <span class="text-xs" style="color: var(--muted-foreground)">
        {label}
      </span>
    {/if}

    {#if error}
      <span class="text-xs" style="color: var(--destructive)">{error}</span>
    {/if}

    <input
      bind:this={fileInput}
      type="file"
      accept="image/*"
      onchange={handleFile}
      class="hidden"
    />
  </div>
{/if}