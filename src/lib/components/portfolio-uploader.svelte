<!-- src/lib/components/portfolio-uploader.svelte -->
<script lang="ts">
  import { Spinner } from '$lib/components/ui/spinner'
  import PlusIcon from '@lucide/svelte/icons/plus'
  import XIcon from '@lucide/svelte/icons/x'
  import Image from '@lucide/svelte/icons/image'

  let {
    images = $bindable<string[]>([]),
    publicIds = $bindable<string[]>([]),
    maxItems = 6,
    uploading = $bindable(false),
    onError,
  }: {
    images: string[]
    publicIds: string[]
    maxItems?: number
    uploading?: boolean
    onError?: (msg: string) => void
  } = $props()

  const MAX_MB = 10
  let removingIdx = $state<number | null>(null)

  async function uploadOne(
    file: File,
  ): Promise<{ url: string; publicId: string }> {
    const sigRes = await fetch('/api/upload/signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'job', resourceType: 'image' }),
    })
    if (!sigRes.ok) {
      const err = await sigRes.json().catch(() => ({}))
      throw new Error(err?.error ?? 'Не вдалось отримати підпис')
    }
    const sig = await sigRes.json()

    const fd = new FormData()
    fd.append('file', file)
    fd.append('api_key', sig.apiKey)
    fd.append('timestamp', String(sig.timestamp))
    fd.append('signature', sig.signature)
    fd.append('folder', sig.folder)

    const upRes = await fetch(
      `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
      { method: 'POST', body: fd },
    )
    if (!upRes.ok) {
      const upErr = await upRes.json().catch(() => ({}))
      throw new Error(upErr?.error?.message ?? 'Помилка завантаження')
    }

    const json = await upRes.json()
    return { url: json.secure_url, publicId: json.public_id }
  }

  async function handleChange(e: Event) {
    const input = e.target as HTMLInputElement
    const files = Array.from(input.files ?? [])
    if (!files.length) return

    const available = maxItems - images.length
    if (available <= 0) {
      onError?.(`Максимум ${maxItems} фото`)
      input.value = ''
      return
    }

    const toUpload = files.slice(0, available)
    uploading = true

    for (const file of toUpload) {
      if (file.size > MAX_MB * 1024 * 1024) {
        onError?.(`Файл "${file.name}" перевищує ${MAX_MB} МБ`)
        continue
      }
      try {
        const r = await uploadOne(file)
        images = [...images, r.url]
        publicIds = [...publicIds, r.publicId]
      } catch (err) {
        console.error('[portfolio-uploader]', err)
        onError?.(err instanceof Error ? err.message : 'Помилка завантаження')
      }
    }

    uploading = false
    input.value = ''
  }

  async function remove(i: number) {
    const publicId = publicIds[i]
    removingIdx = i

    try {
      const res = await fetch('/api/user/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'portfolio-remove', publicId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Не вдалось видалити')
      }
      images = images.filter((_, idx) => idx !== i)
      publicIds = publicIds.filter((_, idx) => idx !== i)
    } catch (err) {
      console.error('[portfolio-uploader:remove]', err)
      onError?.(err instanceof Error ? err.message : 'Не вдалось видалити фото')
    } finally {
      removingIdx = null
    }
  }
</script>

<div class="space-y-3">
  <div class="grid grid-cols-3 gap-2.5">
    {#each images as img, i (img)}
      <div
        class="group relative aspect-square rounded-2xl overflow-hidden shadow-sm"
        style="background-color: color-mix(in oklch, var(--foreground) 6%, transparent)"
      >
        <img
          src={img}
          alt="Робота {i + 1}"
          class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />

        <!-- gradient overlay -->
        <div
          class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style="background: linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)"
        ></div>

        <!-- delete button -->
        <button
          type="button"
          onclick={() => remove(i)}
          disabled={removingIdx === i}
          class="cursor-pointer absolute top-2 right-2 size-7 rounded-full flex items-center justify-center
                 opacity-0 group-hover:opacity-100 transition-all duration-200
                 hover:scale-110 active:scale-95 disabled:cursor-not-allowed"
          style="background-color: rgba(0,0,0,0.7);
                 backdrop-filter: blur(8px);
                 border: 1px solid rgba(255,255,255,0.15)"
          aria-label="Видалити фото {i + 1}"
        >
          {#if removingIdx === i}
            <Spinner class="size-3 text-white" />
          {:else}
            <XIcon class="size-3.5 text-white" />
          {/if}
        </button>

        <!-- full overlay during delete -->
        {#if removingIdx === i}
          <div
            class="absolute inset-0 flex items-center justify-center"
            style="background-color: rgba(0,0,0,0.5); backdrop-filter: blur(2px)"
          >
            <Spinner class="text-white" />
          </div>
        {/if}

        <!-- index badge -->
        <div
          class="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        >
          <span
            class="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
            style="background-color: rgba(0,0,0,0.6);
                   backdrop-filter: blur(4px);
                   color: rgba(255,255,255,0.9)"
          >
            {i + 1} / {maxItems}
          </span>
        </div>
      </div>
    {/each}

    <!-- upload slot -->
    {#if images.length < maxItems}
      <label
        class="group aspect-square rounded-2xl flex flex-col items-center justify-center gap-2
               transition-all duration-200 cursor-pointer"
        class:cursor-not-allowed={uploading}
        style="background-color: color-mix(in oklch, var(--foreground) 3%, transparent);
               border: 1.5px dashed color-mix(in oklch, var(--foreground) 18%, transparent)"
        aria-label="Додати фото"
      >
        {#if uploading}
          <Spinner />
          <span
            class="text-[11px] font-medium"
            style="color: var(--muted-foreground)"
          >
            Завантаження...
          </span>
        {:else}
          <div
            class="size-10 rounded-full flex items-center justify-center transition-all duration-200
                   group-hover:scale-110"
            style="background-color: color-mix(in oklch, var(--foreground) 7%, transparent)"
          >
            <PlusIcon class="size-5" style="color: var(--muted-foreground)" />
          </div>
          <span
            class="text-[11px] font-medium"
            style="color: var(--muted-foreground)"
          >
            Додати
          </span>
        {/if}

        <input
          type="file"
          accept="image/*"
          multiple
          onchange={handleChange}
          class="sr-only"
          disabled={uploading}
        />
      </label>
    {/if}

    <!-- empty placeholder slots to always show 3 columns -->
    {#if images.length === 0 && !uploading}
      {#each Array(Math.max(0, 2)) as _}
        <div
          class="aspect-square rounded-2xl flex items-center justify-center"
          style="background-color: color-mix(in oklch, var(--foreground) 2%, transparent);
                 border: 1.5px dashed color-mix(in oklch, var(--foreground) 8%, transparent)"
        >
          <Image class="text-gray-60" />
        </div>
      {/each}
    {/if}
  </div>

  <!-- footer -->
  <div class="flex items-center justify-between px-0.5">
    <div class="flex items-center gap-2">
      <div class="flex gap-0.5">
        {#each Array(maxItems) as _, i}
          <div
            class="h-1 rounded-full transition-all duration-300"
            style="width: {i < images.length ? '16px' : '6px'};
                   background-color: {i < images.length
              ? 'var(--foreground)'
              : 'color-mix(in oklch, var(--foreground) 15%, transparent)'}"
          ></div>
        {/each}
      </div>
      <span
        class="text-[11px] tabular-nums"
        style="color: var(--muted-foreground)"
      >
        {images.length} з {maxItems}
      </span>
    </div>

    {#if images.length > 0}
      <span class="text-[11px]" style="color: var(--muted-foreground)">
        JPG, PNG до {MAX_MB} МБ
      </span>
    {/if}
  </div>
</div>
