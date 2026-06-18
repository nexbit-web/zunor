<script lang="ts">
  import { dev } from '$app/environment'
  import { Spinner } from '$lib/components/ui/spinner'
  import PlusIcon from '@lucide/svelte/icons/plus'
  import XIcon from '@lucide/svelte/icons/x'
  import ImageIcon from '@lucide/svelte/icons/image'

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
      {
        method: 'POST',
        body: fd,
      },
    )
    if (!upRes.ok) {
      const upErr = await upRes.json().catch(() => ({}))
      throw new Error(upErr?.error?.message ?? 'Помилка завантаження')
    }

    const json = await upRes.json()
    return { url: json.secure_url, publicId: json.public_id }
  }

  async function handleChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement
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
        if (dev) console.error('[portfolio-uploader]', err)
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
      if (dev) console.error('[portfolio-uploader:remove]', err)
      onError?.(err instanceof Error ? err.message : 'Не вдалось видалити фото')
    } finally {
      removingIdx = null
    }
  }
</script>

<div class="space-y-4">
  <div class="grid grid-cols-3 gap-2.5">
    {#each images as img, i (img)}
      <div
        class="group relative aspect-square overflow-hidden rounded-[18px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]"
      >
        <img
          src={img}
          alt="Робота {i + 1}"
          class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          decoding="async"
          draggable="false"
        />

        <!-- легкий градієнт для контрасту бейджа (декоративний) -->
        <div
          class="pointer-events-none absolute inset-0 bg-linear-to-t from-black/35 via-transparent to-transparent"
          aria-hidden="true"
        ></div>

        <!-- видалення — завжди видиме (тач без hover) -->
        <button
          type="button"
          onclick={() => remove(i)}
          disabled={removingIdx === i}
          class="absolute top-2 right-2 flex size-7 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/60 backdrop-blur-md transition-transform duration-200 hover:scale-110 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Видалити фото {i + 1}"
        >
          {#if removingIdx === i}
            <Spinner class="size-3 text-white" />
          {:else}
            <XIcon class="size-3.5 text-white" aria-hidden="true" />
          {/if}
        </button>

        <!-- оверлей під час видалення -->
        {#if removingIdx === i}
          <div
            class="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
          >
            <Spinner class="text-white" />
          </div>
        {/if}

        <!-- порядковий бейдж — завжди видимий -->
        <span
          class="absolute bottom-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/90 backdrop-blur-sm"
        >
          {i + 1} / {maxItems}
        </span>
      </div>
    {/each}

    <!-- слот завантаження -->
    {#if images.length < maxItems}
      <label
        class={[
          'group flex aspect-square cursor-pointer flex-col items-center justify-center gap-2.25 rounded-[18px] border-[1.5px] border-dashed border-border bg-muted transition-colors duration-200 hover:border-muted-foreground hover:bg-card focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
          uploading && 'pointer-events-none',
        ]}
        aria-label="Додати фото"
      >
        {#if uploading}
          <span
            class="size-5.5 animate-spin rounded-full border-[2.5px] border-foreground/15 border-t-foreground"
          ></span>
          <span class="text-[11.5px] font-medium text-muted-foreground"
            >Завантаження...</span
          >
        {:else}
          <span
            class="flex size-10.5 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm transition-transform duration-200 group-hover:scale-110"
          >
            <PlusIcon class="size-5" aria-hidden="true" />
          </span>
          <span class="text-[11.5px] font-medium text-muted-foreground"
            >Додати</span
          >
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

    <!-- порожні плейсхолдери, щоб тримати 3 колонки -->
    {#if images.length === 0 && !uploading}
      {#each Array(2) as _, i (i)}
        <div
          class="flex aspect-square items-center justify-center rounded-[18px] border-[1.5px] border-dashed border-border bg-muted/40 text-muted-foreground/40"
          aria-hidden="true"
        >
          <ImageIcon class="size-5.5" />
        </div>
      {/each}
    {/if}
  </div>

  <!-- футер -->
  <div class="flex items-center justify-between px-0.5">
    <div class="flex items-center gap-2.5">
      <div class="flex gap-0.75" aria-hidden="true">
        {#each Array(maxItems) as _, i (i)}
          <div
            class={[
              'h-1 rounded-full transition-all duration-300',
              i < images.length ? 'bg-foreground' : 'bg-foreground/15',
            ]}
            style:width={i < images.length ? '16px' : '6px'}
          ></div>
        {/each}
      </div>
      <span class="text-[11.5px] tabular-nums text-muted-foreground"
        >{images.length} з {maxItems}</span
      >
    </div>

    {#if images.length > 0}
      <span class="text-[11.5px] text-muted-foreground"
        >JPG, PNG до {MAX_MB} МБ</span
      >
    {/if}
  </div>
</div>
