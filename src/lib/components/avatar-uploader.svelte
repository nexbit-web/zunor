<script lang="ts">
  // Фото профілю, як у Telegram.
  //
  //   • Немає фото — коло з градієнтом акцентного кольору й камерою з
  //     плюсом: натиск одразу відкриває вибір файлу.
  //   • Є фото — те саме коло, але фото під легким затемненням і та сама
  //     камера поверх; натиск відкриває меню «Змінити / Видалити».
  //   • Обраний файл спершу йде в редактор (avatar-cropper): зсунути,
  //     наблизити, повернути. Вантажиться вже обрізаний квадрат.
  //
  // Зміна й видалення фото діють ОДРАЗУ, а не з кнопкою «Зберегти» форми:
  // файл у хмарі має фіксований publicId і перезаписується при
  // завантаженні, тож «відкласти до збереження» все одно не виходило —
  // хмара вже мала нове фото, а база ще посилалась на старе. Видалення
  // прибирає і запис у базі, і файл у Cloudinary (api/user/media).
  //
  // Форма отримує нові value/publicId через bind і при збереженні шле
  // ті самі значення, що вже лежать у базі.

  import { invalidateAll } from '$app/navigation'
  import { mergeProps } from 'bits-ui'
  import { Spring, prefersReducedMotion } from 'svelte/motion'
  import * as Avatar from '$lib/components/ui/avatar'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import { CameraAddIcon } from '$lib/components/icons'
  import ImageUp from '$lib/components/icons/set/image-up.svelte'
  import Trash2 from '$lib/components/icons/set/trash-2.svelte'
  import { Spinner } from './ui/spinner'
  import AvatarCropper from './avatar-cropper.svelte'

  let {
    value = $bindable(''),
    publicId = $bindable(''),
    uploading = $bindable(false),
    large = false,
    onError,
  }: {
    value?: string
    publicId?: string
    /** Іде завантаження чи видалення — форма не дає зберегти. */
    uploading?: boolean
    /**
     * Велике фото по центру — для окремого кроку «Фото» в онбордингу, де
     * воно єдиний вміст екрана. У формі профілю — звичайний розмір.
     */
    large?: boolean
    onError?: (msg: string) => void
  } = $props()

  /** Оригінал обрізаємо в браузері, тож межа — на розумний файл з камери. */
  const MAX_MB = 20

  let fileInput = $state<HTMLInputElement>()
  let cropFile = $state<File | null>(null)
  let previewUrl = $state('')
  let removing = $state(false)
  let confirmOpen = $state(false)
  let error = $state('')

  const busy = $derived(uploading || removing)
  const shown = $derived(previewUrl || value)

  // ─── «Гумова» іконка ───
  // Пружинить лише камера всередині кола, саме коло стоїть: під курсором
  // іконка трохи розширюється з легким перельотом, а відпущена — так само
  // мʼяко стискається назад.
  const grow = new Spring(1, {
    stiffness: 0.13,
    damping: 0.28,
    precision: 0.001,
  })

  function setGrow(v: number): void {
    grow.set(v, { instant: prefersReducedMotion.current })
  }

  let hovered = false

  const springHandlers = {
    onpointerenter: (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      hovered = true
      setGrow(1.16)
    },
    onpointerleave: () => {
      hovered = false
      setGrow(1)
    },
    onpointerdown: () => setGrow(0.9),
    onpointerup: () => setGrow(hovered ? 1.16 : 1),
    onpointercancel: () => setGrow(1),
  }

  // ─── Вибір файлу ───

  function pickFile(): void {
    if (!busy) fileInput?.click()
  }

  function report(msg: string): void {
    error = msg
    onError?.(msg)
  }

  function onFileChange(e: Event): void {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      report('Тільки зображення')
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      report(`Фото має бути менше ${MAX_MB} МБ`)
      return
    }
    error = ''
    cropFile = file
  }

  // Меню дашборда бере фото з сесії, а вона кешується в cookie на 5 хв.
  // Без примусового оновлення кешу нове фото зʼявилось би там лише через
  // кілька хвилин.
  async function syncSession(): Promise<void> {
    await fetch('/api/auth/get-session?disableCookieCache=true', {
      cache: 'no-store',
    }).catch(() => {})
    await invalidateAll()
  }

  /** Дочекатись, поки браузер має картинку, — без спалаху порожнього кола. */
  function preload(url: string): Promise<void> {
    const img = new Image()
    img.src = url
    return img.decode().catch(() => {})
  }

  // ─── Завантаження обрізаного ───

  async function upload(blob: Blob): Promise<void> {
    // Обрізане видно одразу, поки воно летить у хмару.
    const local = URL.createObjectURL(blob)
    previewUrl = local
    uploading = true
    error = ''

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
      fd.append('file', blob, 'avatar.jpg')
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
      const uploaded = await upRes.json()

      // 3. Запис у профіль
      const saveRes = await fetch('/api/user/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'avatar',
          url: uploaded.secure_url,
          publicId: uploaded.public_id,
        }),
      })
      if (!saveRes.ok) throw new Error('Не вдалось зберегти фото')

      await preload(uploaded.secure_url)
      value = uploaded.secure_url
      publicId = uploaded.public_id
      void syncSession()
    } catch (err) {
      console.error('[avatar-uploader]', err)
      report(err instanceof Error ? err.message : 'Не вдалось завантажити фото')
    } finally {
      uploading = false
      previewUrl = ''
      URL.revokeObjectURL(local)
    }
  }

  // ─── Видалення ───

  async function remove(): Promise<void> {
    removing = true
    error = ''
    try {
      const res = await fetch('/api/user/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'avatar-remove' }),
      })
      if (!res.ok) throw new Error()
      value = ''
      publicId = ''
      confirmOpen = false
      void syncSession()
    } catch {
      report('Не вдалось видалити фото. Спробуйте ще раз.')
    } finally {
      removing = false
    }
  }

  const sizeClass = $derived(large ? 'size-32' : 'size-20')
  const buttonClass =
    'avatar-button group relative cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-default'
</script>

<div
  class="inline-flex flex-col gap-2 {large
    ? 'items-center gap-3'
    : 'items-start'}"
>
  {#snippet face()}
    {#if shown}
      <Avatar.Root class={sizeClass}>
        <Avatar.Image src={shown} alt="" class="object-cover" />
        <!-- Поки фото вантажиться — нейтральне коло, а не «додати фото»:
             фото вже є, його просто ще не видно. -->
        <Avatar.Fallback class="bg-muted" />
      </Avatar.Root>
    {:else}
      <span class="placeholder block rounded-full {sizeClass}"></span>
    {/if}

    <!-- Шар з іконкою — однаковий для порожнього кола й фото. На фото під
         ним легке затемнення, щоб біла камера читалась на будь-якому
         кадрі; під курсором воно трохи густіше. -->
    <span
      class="absolute inset-0 flex items-center justify-center rounded-full transition-colors duration-200 {shown
        ? 'bg-black/30 text-white group-hover:bg-black/40'
        : 'text-primary-foreground'}"
      aria-hidden="true"
    >
      {#if busy}
        <Spinner class="{large ? 'size-7' : 'size-5'} animate-spin" />
      {:else}
        <span class="flex" style:transform="scale({grow.current})">
          <CameraAddIcon size={large ? 52 : 32} />
        </span>
      {/if}
    </span>
  {/snippet}

  {#if value && !previewUrl}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger disabled={busy}>
        {#snippet child({ props })}
          <!-- mergeProps: меню bits-ui відкривається на pointerdown, і
               звичайний spread пружини перетер би його обробник. -->
          <button
            {...mergeProps(props, springHandlers)}
            type="button"
            aria-label="Фото профілю: змінити чи видалити"
            class={buttonClass}
          >
            {@render face()}
          </button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align={large ? 'center' : 'start'} class="min-w-44">
        <DropdownMenu.Item onSelect={pickFile}>
          <ImageUp />
          Змінити фото
        </DropdownMenu.Item>
        <DropdownMenu.Item
          variant="destructive"
          onSelect={() => (confirmOpen = true)}
        >
          <Trash2 />
          Видалити фото
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  {:else}
    <button
      {...springHandlers}
      type="button"
      onclick={pickFile}
      disabled={busy}
      aria-label="Додати фото"
      class={buttonClass}
    >
      {@render face()}
    </button>
  {/if}

  <span class="text-muted-foreground {large ? 'text-[13px]' : 'text-[12px]'}">
    {#if uploading}
      Завантажуємо...
    {:else if removing}
      Видаляємо...
    {:else if value}
      Натисніть, щоб змінити
    {:else}
      Натисніть, щоб додати
    {/if}
  </span>

  {#if error}
    <span class="max-w-56 text-[12px] text-destructive" role="alert">
      {error}
    </span>
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    onchange={onFileChange}
    class="hidden"
    disabled={busy}
  />
</div>

<AvatarCropper bind:file={cropFile} onConfirm={upload} />

<AlertDialog.Root bind:open={confirmOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Видалити фото профілю?</AlertDialog.Title>
      <AlertDialog.Description>
        Фото зникне з профілю і з нашого сервера. Повернути його не вийде —
        лише завантажити знову.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={removing}>Скасувати</AlertDialog.Cancel>
      <AlertDialog.Action
        onclick={remove}
        disabled={removing}
        variant="destructive"
      >
        {removing ? 'Видаляємо...' : 'Видалити'}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<style>
  /* Градієнт з акцентного кольору, як у Telegram: згори акцент, розбавлений
     білим на третину, донизу — сам акцент. Для синього це рівно їхнє коло
     (звірено з їхнім скриншотом). Колір значка — текст на акценті, тож
     і чорно-білий акцент читається. */
  .placeholder {
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--primary), white 35%),
      var(--primary)
    );
  }
</style>
