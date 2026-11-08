<script lang="ts">
  import { dev } from '$app/environment'
  import { photoLightbox, type PhotoViewer } from '$lib/utils/photo-lightbox'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import { Spinner } from '$lib/components/ui/spinner'
  import PlusIcon from '$lib/components/icons/set/plus.svelte'
  import XIcon from '$lib/components/icons/set/x.svelte'
  import CloudUploadIcon from '$lib/components/icons/set/cloud-upload.svelte'
  import { slide } from 'svelte/transition'

  let {
    images = $bindable<string[]>([]),
    publicIds = $bindable<string[]>([]),
    maxItems = 6,
    uploading = $bindable(false),
    savedIds,
    onError,
  }: {
    images: string[]
    publicIds: string[]
    maxItems?: number
    uploading?: boolean
    /**
     * publicId фото, що вже лежать у профілі. Решта — щойно завантажені:
     * вони вже в хмарі й видні в сітці, але в профіль потраплять лише з
     * кнопкою «Зберегти» форми (разом із перевіркою). Без пропа — нічого
     * не позначаємо (онбординг, де незбережене все).
     */
    savedIds?: string[]
    onError?: (msg: string) => void
  } = $props()

  const isNew = (i: number): boolean =>
    !!savedIds && !savedIds.includes(publicIds[i])
  const newCount = $derived(
    savedIds ? publicIds.filter((id) => !savedIds.includes(id)).length : 0,
  )

  const MAX_MB = 10
  let removingIdx = $state<number | null>(null)

  // Натиск на фото — повноекранний перегляд з гортанням усіх робіт. У
  // ньому є кошик: питаємо підтвердження поверх перегляду, а видаляємо
  // вже після його закриття — щоб він стягнувся в мініатюру, поки вона
  // ще на місці.
  let grid = $state<HTMLElement | null>(null)
  let pending = $state<{ index: number; viewer: PhotoViewer } | null>(null)

  $effect(() => {
    if (!grid) return
    return photoLightbox(grid, {
      onDelete: (index, viewer) => {
        viewer.hold(true)
        pending = { index, viewer }
      },
    })
  })

  function confirmDelete(): void {
    if (!pending) return
    const { index, viewer } = pending
    pending = null
    viewer.close()
    remove(index)
  }

  function cancelDelete(): void {
    pending?.viewer.hold(false)
    pending = null
  }

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

<div class="space-y-3">
  <div bind:this={grid} class="grid grid-cols-3 gap-2.5">
    {#each images as img, i (img)}
      <!-- Ні градієнта, ні порядкового бейджа: градієнт існував тільки
           щоб бейдж читався, а бейдж нумерував фотографії, які людина й
           так бачить очима. Лічильник лишився один — у підвалі. -->
      <div
        class="group relative aspect-square overflow-hidden rounded-[8px] bg-muted"
      >
        <!-- Посилання, а не кнопка: без JS фото відкривається вкладкою.
             Хрестик — сусід, а не нащадок, тож видалення перегляд не
             відкриває. -->
        <a
          href={img}
          data-pswp
          data-cropped
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Переглянути фото {i + 1}"
          class="block h-full w-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <img
            src={img}
            alt="Робота {i + 1}"
            class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
            decoding="async"
            draggable="false"
          />
        </a>

        <!-- Видалення видиме завжди: на тачі ховера немає. -->
        <button
          type="button"
          onclick={() => remove(i)}
          disabled={removingIdx === i}
          class="absolute top-1.5 right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition-colors hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Видалити фото {i + 1}"
        >
          <!-- Спінер під час видалення один — на оверлеї. Другий, у самій
               кнопці, крутився поруч і показував те саме. -->
          <XIcon class="size-3.5" aria-hidden="true" />
        </button>

        <!-- Фото вже видно, тож без позначки воно виглядає збереженим.
             Саме так його й втрачали: виходили, не натиснувши «Зберегти». -->
        {#if isNew(i)}
          <span
            class="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[11px] leading-none font-semibold text-primary-foreground"
          >
            Нове
          </span>
        {/if}

        {#if removingIdx === i}
          <div
            class="absolute inset-0 flex items-center justify-center bg-black/45"
          >
            <Spinner class="animate-spin text-white" />
          </div>
        {/if}
      </div>
    {/each}

    <!-- Слот завантаження -->
    {#if images.length < maxItems}
      <label
        class={[
          'flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-[8px] border border-input bg-muted/40 transition-colors outline-none hover:bg-muted focus-within:border-primary focus-within:shadow-[0_0_0_1px_var(--primary)]',
          uploading && 'pointer-events-none',
        ]}
        aria-label="Додати фото"
      >
        {#if uploading}
          <Spinner class="animate-spin text-muted-foreground" />
          <span class="text-[12px] text-muted-foreground">Завантаження...</span>
        {:else}
          <PlusIcon class="size-5 text-muted-foreground" aria-hidden="true" />
          <span class="text-[12px] text-muted-foreground">Додати</span>
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
  </div>

  <!-- Підказка під сіткою, а не тост: вона має бути на місці, поки фото
       не збережене, а не зникнути за чотири секунди. Кнопка «Зберегти» —
       одразу під цією карткою. -->
  {#if newCount > 0}
    <div
      transition:slide={{ duration: 200 }}
      class="flex items-start gap-2.5 rounded-[8px] bg-primary/10 px-3 py-2.5 text-[13px] leading-snug"
      role="status"
    >
      <CloudUploadIcon
        class="mt-px size-4 shrink-0 text-primary"
        aria-hidden="true"
      />
      <p>
        {newCount === 1 ? 'Нове фото ще не збережене' : 'Нові фото ще не збережені'}.
        <span class="text-muted-foreground">
          Натисніть «Зберегти» внизу — і {newCount === 1 ? 'воно піде' : 'вони підуть'}
          на перевірку разом із профілем.
        </span>
      </p>
    </div>
  {/if}

  <!-- Підвал: скільки завантажено і що приймаємо. Смужок-індикатора
       більше немає — він показував те саме число, що й цифри поруч. -->
  <div
    class="flex items-center justify-between px-0.5 text-[12px] text-muted-foreground"
  >
    <span class="tabular-nums">{images.length} з {maxItems}</span>
    <span>JPG, PNG до {MAX_MB} МБ</span>
  </div>
</div>

<AlertDialog.Root
  open={pending !== null}
  onOpenChange={(open) => {
    if (!open) cancelDelete()
  }}
>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Видалити фото?</AlertDialog.Title>
      <AlertDialog.Description>
        Воно зникне з прикладів робіт і з нашого сервера.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Скасувати</AlertDialog.Cancel>
      <AlertDialog.Action onclick={confirmDelete} variant="destructive">
        Видалити
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
