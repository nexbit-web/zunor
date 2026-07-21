<script lang="ts">
  import { onMount, tick } from 'svelte'
  import ArrowUp from '@lucide/svelte/icons/arrow-up'
  import ArrowDown from '@lucide/svelte/icons/arrow-down'
  import Check from '@lucide/svelte/icons/check'
  import Copy from '@lucide/svelte/icons/copy'
  import Pencil from '@lucide/svelte/icons/pencil'
  import { fly, fade, scale } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import GradientHeart from '$lib/components/gradient-heart.svelte'
  import LottiePlayer from '$lib/components/lottie-player.svelte'
  import { Spinner } from '$lib/components/ui/spinner'
  import * as Tooltip from '$lib/components/ui/tooltip'
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check'
  import Home from '@lucide/svelte/icons/home'
  import Building from '@lucide/svelte/icons/building'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import Calendar from '@lucide/svelte/icons/calendar'
  import DoorOpen from '@lucide/svelte/icons/door-open'
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Repeat from '@lucide/svelte/icons/repeat'
  import AppWindow from '@lucide/svelte/icons/app-window'
  import Columns2 from '@lucide/svelte/icons/columns-2'
  import Plus from '@lucide/svelte/icons/plus'
  import X from '@lucide/svelte/icons/x'
  import { dev } from '$app/environment'
  import { playSuccessSound, unlockAudio } from '$lib/sound/notification'
  import type {
    ZunorDraft,
    ZunorResponse,
    ZunorClientMessage,
  } from '$lib/types/zunor'
  import ThinkingLogo from '$lib/components/thinking-logo.svelte'

  // ─── AI-оформлення заявки ───
  // Діалог веде Zunor-агент через POST /api/zunor/chat (сервер → DeepSeek).
  // Агент збирає дані, придумує назву й опис і повертає драфт. Заявку
  // створює ЛИШЕ людина кнопкою «Підтвердити» → звичайний POST /api/jobs.
  //
  // Скрол-машинерія (bind:clientHeight інпут-панелі, pinIfAtBottom через
  // подвійний rAF, blur-шари) — без змін відносно макета: коментарі про
  // ResizeObserver-нюанс дивись біля pinIfAtBottom().

  type Msg =
    | { id: number; role: 'user'; text: string; images?: string[] }
    | {
        id: number
        role: 'zunor'
        text: string
        shown: number
        typing: boolean
        thinkSeconds: number
      }
    | { id: number; role: 'summary'; draft: ZunorDraft }

  let messages = $state<Msg[]>([])
  // Швидкі відповіді від Zunor (парсяться сервером із відповіді моделі)
  let chips = $state<string[]>([])
  let input = $state('')
  let waiting = $state(false) // чекаємо відповідь /api/zunor/chat
  let submitting = $state(false) // створюємо заявку через /api/jobs
  let finished = $state(false)
  let started = $state(false)
  let copiedId = $state<number | null>(null)
  let showScrollButton = $state(false)
  let heartVisible = $state(false)
  let scrollEl = $state<HTMLDivElement | undefined>(undefined)
  let textareaEl = $state<HTMLTextAreaElement | undefined>(undefined)

  // ─── Фото як у месенджері ───
  // pending — завантажені, чекають у панелі вводу; після відправки
  // переїжджають у sent (показуються в діалозі + підуть у POST /api/jobs).
  const MAX_PHOTOS = 6
  const MAX_MB = 10
  type Photo = { url: string; publicId: string }
  let pendingPhotos = $state<Photo[]>([])
  let sentPhotos = $state<Photo[]>([])
  let uploadingCount = $state(0)
  let uploadError = $state('')
  let uploading = $derived(uploadingCount > 0)
  let fileInputEl = $state<HTMLInputElement | undefined>(undefined)

  // Кнопка «+» оживає, щойно Zunor дійшов до фото-кроку (чіпс «Додати фото»)
  // або вже сформував заявку. Одного разу розблокована — лишається активною.
  let photosUnlocked = $state(false)
  let photosAllowed = $derived(
    photosUnlocked || messages.some((m) => m.role === 'summary'),
  )
  // Фото-стадія: Zunor саме зараз пропонує фото → пульсуємо кнопкою «+»
  let photoStage = $derived(chips.includes('Додати фото'))
  // Іконки рядків summary — ті самі імена, що віддає describeJob
  const ROW_ICONS: Record<string, typeof ClipboardCheck> = {
    Home,
    Building,
    Sparkles,
    Calendar,
    DoorOpen,
    ArrowUpDown,
    Trash2,
    Repeat,
    AppWindow,
    Columns2,
  }
  function rowIcon(name?: string): typeof ClipboardCheck {
    return (name && ROW_ICONS[name]) || ClipboardCheck
  }

  // Hero-інпут росте вище, ніж чатовий, і лише потім зʼявляється скрол
  let inputMaxH = $derived(started ? 160 : 300)

  const PHOTOS_LOCKED_HINT =
    'Фото можна буде додати, коли Zunor сформує заявку — спочатку розкажи, що прибрати'

  function openFilePicker() {
    if (!photosAllowed || uploading) return
    uploadError = ''
    fileInputEl?.click()
  }

  async function uploadOne(file: File): Promise<Photo> {
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

  async function handleFilesChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (!files.length) return

    const used = sentPhotos.length + pendingPhotos.length
    const available = MAX_PHOTOS - used
    if (available <= 0) {
      uploadError = `Максимум ${MAX_PHOTOS} фото`
      return
    }

    for (const file of files.slice(0, available)) {
      if (file.size > MAX_MB * 1024 * 1024) {
        uploadError = `Файл "${file.name}" перевищує ${MAX_MB} МБ`
        continue
      }
      uploadingCount++
      try {
        const photo = await uploadOne(file)
        pendingPhotos = [...pendingPhotos, photo]
        await pinIfAtBottom() // панель інпуту виросла на висоту превʼю
      } catch (err) {
        if (dev) console.error('[zunor:upload]', err)
        uploadError =
          err instanceof Error ? err.message : 'Помилка завантаження'
      } finally {
        uploadingCount--
      }
    }
  }

  function removePending(i: number) {
    pendingPhotos = pendingPhotos.filter((_, idx) => idx !== i)
  }

  let inputPanelHeight = $state(180)
  const SAFE_GAP = 28
  let fadeZone = $derived(inputPanelHeight + SAFE_GAP)

  let msgId = 0

  const HERO_CHIPS = [
    'Прибрати квартиру',
    'Хімчистка',
    'Генеральне прибирання',
    'Помити вікна',
    'Прибрати після ремонту',
    'Регулярне прибирання',
  ]

  // ─── Анімований плейсхолдер на hero-інпуті ───
  const HERO_PREFIX = 'Треба '
  const HERO_SUFFIXES = [
    'прибрати квартиру...',
    'помити вікна...',
    'хімчистка дивана...',
    'генеральне прибирання...',
    'прибрати після ремонту...',
  ]
  let heroPlaceholder = $state(HERO_PREFIX)

  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
  }

  $effect(() => {
    if (started) return
    let cancelled = false

    async function loop() {
      let phraseIndex = 0
      while (!cancelled) {
        const suffix = HERO_SUFFIXES[phraseIndex]
        for (let i = 1; i <= suffix.length && !cancelled; i++) {
          heroPlaceholder = HERO_PREFIX + suffix.slice(0, i)
          const base = 40 + Math.random() * 40
          await sleep(suffix[i - 1] === ' ' ? base + 50 : base)
        }
        if (cancelled) break
        await sleep(1500)
        for (let i = suffix.length; i >= 0 && !cancelled; i--) {
          heroPlaceholder = HERO_PREFIX + suffix.slice(0, i)
          await sleep(18 + Math.random() * 12)
        }
        if (cancelled) break
        await sleep(200)
        phraseIndex = (phraseIndex + 1) % HERO_SUFFIXES.length
      }
    }

    loop()
    return () => {
      cancelled = true
    }
  })

  // ─── Скрол ───
  async function scrollToBottom() {
    await tick()
    scrollEl?.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' })
    setTimeout(handleScroll, 60)
    setTimeout(handleScroll, 400)
  }

  // bind:clientHeight оновлюється через ResizeObserver, НЕ синхронно з tick():
  // після зміни контенту панелі чекаємо подвійний rAF, і лише тоді скролимо —
  // і тільки якщо юзер і так був біля низу.
  function nextFrame() {
    return new Promise<void>((res) =>
      requestAnimationFrame(() => requestAnimationFrame(() => res())),
    )
  }

  async function pinIfAtBottom() {
    await nextFrame()
    if (!showScrollButton) await scrollToBottom()
  }

  function handleScroll() {
    if (!scrollEl) return
    const distanceFromBottom =
      scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight
    showScrollButton = distanceFromBottom > 120
  }

  async function focusInput() {
    await tick()
    textareaEl?.focus()
  }

  // ─── Діалог з агентом ───

  /** Історія для API: user + повні тексти zunor (без summary-карток). */
  function apiHistory(): ZunorClientMessage[] {
    return messages.flatMap((m): ZunorClientMessage[] => {
      if (m.role === 'user') {
        // Маркер про фото — лише для моделі, в UI показуються превʼю
        const suffix = m.images?.length
          ? `\n[Клієнт додав ${m.images.length} фото]`
          : ''
        return [{ role: 'user', content: (m.text + suffix).trim() }]
      }
      if (m.role === 'zunor') return [{ role: 'assistant', content: m.text }]
      return []
    })
  }

  /** Друкує відповідь агента з typewriter-ефектом. */
  async function pushZunor(text: string, thinkSeconds: number) {
    const id = msgId++
    messages = [
      ...messages,
      { id, role: 'zunor', text, shown: 0, typing: true, thinkSeconds },
    ]
    await scrollToBottom()

    // Короткі відповіді друкуємо вдумливо, довгі — швидше, щоб не нудити.
    const speed = text.length > 160 ? 6 : text.length > 80 ? 10 : 14
    for (let i = 1; i <= text.length; i++) {
      await sleep(speed)
      messages = messages.map((m) =>
        m.role === 'zunor' && m.id === id ? { ...m, shown: i } : m,
      )
      await tick()
      // Жорсткий pin на кожен символ: смуз-скрол не встигає за текстом
      if (!showScrollButton && scrollEl) {
        scrollEl.scrollTop = scrollEl.scrollHeight
      }
    }
    messages = messages.map((m) =>
      m.role === 'zunor' && m.id === id ? { ...m, typing: false } : m,
    )
    if (!showScrollButton) await scrollToBottom()
  }

  async function advance(userText: string) {
    const text = userText.trim()
    // Можна надіслати самі фото без тексту
    if ((!text && pendingPhotos.length === 0) || waiting || submitting) return
    if (uploading) return // не відправляємо, поки фото ще вантажаться

    const photos = pendingPhotos
    pendingPhotos = []
    sentPhotos = [...sentPhotos, ...photos]

    messages = [
      ...messages,
      {
        id: msgId++,
        role: 'user',
        text,
        images: photos.length ? photos.map((p) => p.url) : undefined,
      },
    ]
    chips = []
    input = ''
    resetTextareaHeight()
    await scrollToBottom()

    waiting = true
    // Індикатор «Thinking» щойно вирендерився і збільшив висоту контенту —
    // доскролюємо, інакше при довгому діалозі він опиняється під інпутом.
    await scrollToBottom()
    const t0 = Date.now()
    try {
      const res = await fetch('/api/zunor/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ messages: apiHistory() }),
      })
      const data = (await res.json().catch(() => null)) as
        | ZunorResponse
        | { message?: string }
        | null

      waiting = false
      const thinkSeconds = Math.max(1, Math.round((Date.now() - t0) / 1000))
      // Фокус повертаємо ОДРАЗУ, щойно textarea розблокувалась (disabled
      // скидає фокус) — щоб можна було друкувати, поки триває typewriter.
      await focusInput()

      if (!res.ok || !data || !('kind' in data)) {
        const msg =
          (data && 'message' in data && data.message) ||
          'Щось пішло не так. Спробуй, будь ласка, ще раз.'
        await pushZunor(String(msg), thinkSeconds)
        return
      }

      await pushZunor(data.reply, thinkSeconds)

      if (data.kind === 'message' && data.suggestions?.length) {
        chips = data.suggestions
        if (chips.includes('Додати фото')) photosUnlocked = true
        // Панель виросла на висоту чіпсів — доскролюємо після layout
        await pinIfAtBottom()
      }

      if (data.kind === 'draft') {
        // Оновлений драфт ЗАМІНЮЄ попередню картку: це та сама заявка,
        // дві однакові картки поспіль лише плутають, яку підтверджувати.
        messages = [
          ...messages.filter((m) => m.role !== 'summary'),
          { id: msgId++, role: 'summary', draft: data.draft },
        ]
        await pinIfAtBottom()
      }
    } catch {
      waiting = false
      await focusInput()
      await pushZunor(
        "Помилка з'єднання. Перевір інтернет і спробуй ще раз.",
        1,
      )
    }
    await focusInput()
  }

  function send() {
    advance(input)
  }

  function pickChip(label: string) {
    if (label === 'Додати фото') {
      openFilePicker()
      return
    }
    advance(label)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // «Змінити» на драфті: локальна підказка агента (потрапить в історію
  // як assistant — модель побачить контекст) + фокус в інпут.
  async function requestEdit() {
    messages = [
      ...messages,
      {
        id: msgId++,
        role: 'zunor',
        text: 'Добре! Напиши, що змінити — я оновлю заявку.',
        shown: 44,
        typing: false,
        thinkSeconds: 1,
      },
    ]
    messages = messages.map((m) =>
      m.role === 'zunor' && m.typing === false ? m : m,
    )
    await pinIfAtBottom()
    await focusInput()
  }

  // ─── Підтвердження: заявку створює СИСТЕМА, не AI ───
  async function confirmOrder(draft: ZunorDraft) {
    if (submitting || uploading) return
    submitting = true
    uploadError = ''
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          metadata: draft.metadata,
          title: draft.title,
          description: draft.description,
          attachments: sentPhotos.map((p) => p.url),
          attachmentsPublicIds: sentPhotos.map((p) => p.publicId),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        message?: string
      }

      if (!res.ok) {
        submitting = false
        await pushZunor(
          json?.message ??
            (res.status === 429
              ? 'Забагато заявок. Спробуй трохи пізніше.'
              : 'Не вдалось створити заявку. Спробуй ще раз.'),
          1,
        )
        return
      }

      finished = true
      celebrate()
      playSuccessSound()
      setTimeout(() => goto('/dashboard/jobs', { invalidateAll: true }), 2200)
    } catch {
      submitting = false
      await pushZunor(
        "Помилка з'єднання. Перевір інтернет і спробуй ще раз.",
        1,
      )
    }
  }

  // confetti — ліниво, не тягнемо в початковий бандл
  async function celebrate() {
    try {
      const { default: confetti } = await import('canvas-confetti')
      const colors = [
        '#FFD700',
        '#FFA500',
        '#22C55E',
        '#3B82F6',
        '#EC4899',
        '#FF5C00',
      ]
      confetti({
        particleCount: 70,
        spread: 70,
        origin: { y: 0.6 },
        colors,
        disableForReducedMotion: true,
      })
    } catch {
      /* не критично */
    }
  }

  // ─── Hero ───
  async function startChat(text: string) {
    if ((!text.trim() && pendingPhotos.length === 0) || started || waiting)
      return
    unlockAudio() // розблокування звуку на перший жест (autoplay policy)
    heartVisible = false
    started = true
    await tick()
    await advance(text)
  }

  function heroPick(label: string) {
    startChat(label)
  }

  function heroSend() {
    startChat(input)
  }

  function handleHeroKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      heroSend()
    }
  }

  function autoResize() {
    if (!textareaEl) return
    textareaEl.style.height = 'auto'
    textareaEl.style.height =
      Math.min(textareaEl.scrollHeight, inputMaxH) + 'px'
  }

  function resetTextareaHeight() {
    requestAnimationFrame(() => {
      if (textareaEl) textareaEl.style.height = 'auto'
    })
  }

  async function copyText(id: number, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      copiedId = id
      setTimeout(() => (copiedId = null), 1500)
    } catch {
      /* clipboard недоступний — не критично */
    }
  }

  onMount(() => {
    document.body.style.overflow = 'hidden'

    requestAnimationFrame(() => {
      heartVisible = true
    })

    // Автозапуск, якщо прийшли з головної з готовим текстом (?q=)
    const initialQuery = page.url.searchParams.get('q')
    if (initialQuery) {
      startChat(initialQuery)
      // прибираємо ?q= з адреси, щоб F5 не стартував діалог заново
      goto('/dashboard/jobs/new', {
        replaceState: true,
        noScroll: true,
        keepFocus: true,
      })
    }

    const ro = new ResizeObserver(() => handleScroll())
    if (scrollEl) {
      ro.observe(scrollEl)
      if (scrollEl.firstElementChild) ro.observe(scrollEl.firstElementChild)
    }
    window.addEventListener('resize', handleScroll)

    return () => {
      document.body.style.overflow = ''
      ro.disconnect()
      window.removeEventListener('resize', handleScroll)
    }
  })
</script>

<svelte:head>
  <title>Замовити прибирання · Zunor</title>
</svelte:head>

<input
  bind:this={fileInputEl}
  type="file"
  accept="image/*"
  multiple
  onchange={handleFilesChange}
  class="sr-only"
  aria-label="Додати фото"
/>

<div
  class="job-scope relative flex h-full min-h-0 flex-col overflow-hidden bg-background"
>
  {#snippet photoButton()}
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger
          onclick={openFilePicker}
          aria-disabled={!photosAllowed || uploading}
          aria-label="Додати фото"
          class={[
            'flex size-8 items-center justify-center rounded-full border border-border bg-muted shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-150 active:scale-[0.97]',
            photosAllowed && !uploading
              ? 'cursor-pointer text-muted-foreground hover:text-foreground'
              : 'cursor-not-allowed text-muted-foreground/40',
          ]}
          style="background: var(--bg-translucent);"
        >
          <Plus size={16} strokeWidth={2.1} aria-hidden="true" />
        </Tooltip.Trigger>
        {#if !photosAllowed}
          <Tooltip.Content side="top" class="max-w-56 text-center">
            {PHOTOS_LOCKED_HINT}
          </Tooltip.Content>
        {:else if uploading}
          <Tooltip.Content side="top"
            >Зачекай, фото завантажується…</Tooltip.Content
          >
        {/if}
      </Tooltip.Root>
    </Tooltip.Provider>
  {/snippet}

  {#snippet pendingPreview()}
    {#if pendingPhotos.length || uploading || uploadError}
      <div class="flex flex-col gap-1.5 px-2 pb-1">
        {#if pendingPhotos.length || uploading}
          <div class="flex flex-wrap items-center gap-2">
            {#each pendingPhotos as photo, i (photo.publicId)}
              <div
                class="group relative"
                in:scale={{ duration: 200, start: 0.9 }}
              >
                <img
                  src={photo.url}
                  alt="Фото {i + 1}"
                  class="size-20 rounded-[16px] border border-border object-cover shadow-sm"
                />
                <button
                  type="button"
                  onclick={() => removePending(i)}
                  aria-label="Прибрати фото {i + 1}"
                  class="absolute -top-1.5 -right-1.5 flex size-5.5 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/70 text-white shadow backdrop-blur-sm transition-transform hover:scale-110 active:scale-95"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            {/each}
            {#if uploading}
              <div
                class="flex size-20 items-center justify-center rounded-[16px] border-[1.5px] border-dashed border-border bg-muted"
                aria-label="Завантаження фото"
              >
                <Spinner class="size-5 animate-spin text-muted-foreground" />
              </div>
            {/if}
          </div>
        {/if}
        {#if uploadError}
          <p class="text-[12px] text-destructive" role="alert">{uploadError}</p>
        {/if}
      </div>
    {/if}
  {/snippet}

  {#if heartVisible}
    <div
      class="pointer-events-none absolute inset-0 z-0 flex items-end justify-center overflow-hidden"
      aria-hidden="true"
    >
      <div
        class="translate-y-1/3"
        in:fly={{ y: 80, duration: 1400, easing: quintOut }}
        out:fade={{ duration: 900, easing: quintOut }}
      >
        <GradientHeart
          size={640}
          blur={60}
          stretchWidth={3300}
          stretchHeight={1000}
        />
      </div>
    </div>
  {/if}

  {#if finished}
    <div
      class="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center"
      in:scale={{ duration: 400, start: 0.85, easing: quintOut }}
      role="status"
      aria-live="polite"
    >
      <span
        class="mb-4 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <Check size={28} aria-hidden="true" />
      </span>
      <h2 class="text-[22px] font-bold tracking-[-0.03em] text-foreground">
        Готово!
      </h2>
      <p class="max-w-70 text-[14.5px] leading-relaxed text-muted-foreground">
        <span class="font-semibold text-foreground">Zunor:</span> я вже шукаю тобі
        клінера.
      </p>
    </div>
  {:else if !started}
    <!-- ─── HERO ─── -->
    <div
      class="flex flex-1 flex-col items-center justify-center px-4"
      in:fade={{ duration: 250 }}
    >
      <div
        class="mb-7 flex max-w-md flex-col items-center gap-2 text-center"
        in:fly={{ y: 8, duration: 350, easing: quintOut }}
      >
        <h1
          class="text-primary-pulse flex items-center gap-1 text-2xl leading-tight font-medium opacity-100 transition-opacity duration-500 md:gap-0 md:text-3xl"
        >
          <span class="min-h-6 pt-0.5 sm:min-h-7 md:min-h-8 md:pt-0"
            >Що прибрати?</span
          >
        </h1>
      </div>

      <div
        class="z-1 flex w-full max-w-2xl flex-col gap-3"
        in:fly={{ y: 10, duration: 400, delay: 80, easing: quintOut }}
      >
        <div
          class="flex flex-col rounded-[28px] border border-border bg-card p-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
        >
          {@render pendingPreview()}
          <textarea
            bind:this={textareaEl}
            bind:value={input}
            oninput={autoResize}
            onkeydown={handleHeroKeydown}
            rows="1"
            placeholder={heroPlaceholder}
            disabled={waiting}
            style:max-height="{inputMaxH}px"
            class="job-input-plain w-full flex-1 resize-none bg-transparent px-2 py-2 text-[16px] leading-snug"
          ></textarea>

          <div class="flex items-center justify-between pt-2">
            {@render photoButton()}
            <div class="flex items-center gap-2">
              <span
                class="rounded-full border border-border bg-background px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground"
                style="background: var(--bg-translucent);"
              >
                Прибирання · Одеса
              </span>
              <button
                type="button"
                onclick={heroSend}
                disabled={waiting ||
                  uploading ||
                  (!input.trim() && !pendingPhotos.length)}
                aria-label="Надіслати"
                class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-white transition disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowUp size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap justify-center gap-2">
          {#each HERO_CHIPS as c (c)}
            <button
              type="button"
              onclick={() => heroPick(c)}
              class="cursor-pointer rounded-full border border-border bg-card px-4 py-2 text-[13.5px] font-medium text-foreground transition-all duration-300 hover:bg-muted active:scale-[0.98]"
            >
              {c}
            </button>
          {/each}
        </div>

        <a
          href="/dashboard/jobs/new/manual"
          class="mt-1 text-center text-[12.5px] text-muted-foreground underline-offset-2 transition-opacity hover:opacity-70 hover:underline"
        >
          Заповнити форму вручну
        </a>
      </div>
    </div>
  {:else}
    <!-- ─── ЧАТ ─── -->
    <div class="relative min-h-0 flex-1">
      <div
        bind:this={scrollEl}
        onscroll={handleScroll}
        class="scroll-area h-full overflow-y-auto overscroll-contain"
        style:--fade-zone="{fadeZone}px"
      >
        <div
          class="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 pt-11"
          style:padding-bottom="{fadeZone}px"
        >
          {#each messages as m (m.id)}
            {#if m.role === 'user'}
              <div
                class="flex justify-end"
                in:fly={{ y: 6, duration: 280, easing: quintOut }}
              >
                <div class="flex max-w-[75%] flex-col items-end gap-1.5">
                  {#if m.images?.length}
                    <div class="flex flex-wrap justify-end gap-1.5">
                      {#each m.images as img, ii (img + ii)}
                        <img
                          src={img}
                          alt="Фото {ii + 1}"
                          class="size-24 rounded-2xl border border-border object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      {/each}
                    </div>
                  {/if}
                  {#if m.text}
                    <div
                      class="w-fit rounded-3xl rounded-br-md border border-border bg-card px-4 py-3 text-[16px] leading-5.5 whitespace-pre-wrap wrap-break-word text-foreground"
                    >
                      {m.text}
                    </div>
                  {/if}
                </div>
              </div>
            {:else if m.role === 'zunor'}
              <div in:fade={{ duration: 220 }}>
                <p class="mb-2 text-[13px] text-muted-foreground">
                  Thought for {m.thinkSeconds}s
                </p>
                <p
                  class="text-[15.5px] leading-[1.7] whitespace-pre-wrap wrap-break-word text-foreground"
                >
                  {m.text.slice(0, m.shown)}{#if m.typing}<span
                      class="ml-0.5 -mb-0.5 inline-block h-3.75 w-0.5 animate-pulse bg-foreground/50"
                    ></span>{/if}
                </p>
                {#if !m.typing}
                  <div
                    class="mt-3 -ml-1.5 flex items-center gap-0.5"
                    transition:fade={{ duration: 200 }}
                  >
                    <button
                      type="button"
                      aria-label="Копіювати"
                      onclick={() => copyText(m.id, m.text)}
                      class="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {#if copiedId === m.id}
                        <Check size={14} aria-hidden="true" />
                      {:else}
                        <Copy size={14} aria-hidden="true" />
                      {/if}
                    </button>
                  </div>
                {/if}
              </div>
            {:else}
              <!-- ─── Summary-картка драфту від Zunor (Telegram/Apple minimal) ─── -->
              <div
                class="w-full"
                in:fly={{ y: 8, duration: 380, easing: quintOut }}
              >
                <p
                  class="mb-1 px-1 text-[20px] font-bold tracking-[-0.02em] text-foreground"
                >
                  {m.draft.title}
                </p>
                {#if m.draft.description}
                  <p
                    class="mb-5 px-1 text-[13.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground"
                  >
                    {m.draft.description}
                  </p>
                {/if}

                <div
                  class="mb-3 overflow-hidden rounded-[18px] bg-card shadow-[0_1px_2px_rgba(20,24,40,0.04)]"
                >
                  {#each m.draft.summary as row, ri (row.label)}
                    {@const RowIcon = rowIcon(row.icon)}
                    <div
                      class="flex items-center gap-3 px-4 py-3.5 {ri > 0
                        ? 'border-t border-border/60'
                        : ''}"
                    >
                      <span
                        class="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                      >
                        <RowIcon size={14} aria-hidden="true" />
                      </span>
                      <span class="flex-1 text-[14.5px] text-foreground"
                        >{row.label}</span
                      >
                      <span class="text-[14.5px] text-muted-foreground"
                        >{row.value}</span
                      >
                    </div>
                  {/each}
                </div>

                {#if sentPhotos.length}
                  <div class="mb-5 flex items-center gap-2 px-1">
                    {#each sentPhotos as photo (photo.publicId)}
                      <img
                        src={photo.url}
                        alt="Прикріплене фото"
                        class="size-10 rounded-[10px] object-cover"
                        loading="lazy"
                      />
                    {/each}
                    <span class="text-[12.5px] text-muted-foreground/70"
                      >{sentPhotos.length} фото прикріплено</span
                    >
                  </div>
                {/if}

                <button
                  type="button"
                  onclick={() => confirmOrder(m.draft)}
                  disabled={submitting || uploading}
                  aria-busy={submitting}
                  class="mt-1.5 inline-flex h-13.5 w-full items-center justify-center rounded-[16px] bg-primary text-[15.5px] font-semibold tracking-[-0.01em] text-primary-foreground transition hover:-translate-y-px hover:bg-primary-hover active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  {#if submitting}
                    <Spinner
                      class="absolute right-4 animate-spin"
                      aria-hidden="true"
                    />
                    Зачекайте...
                  {:else if uploading}
                    Завантаження фото...
                  {:else}
                    Підтвердити заявку
                  {/if}
                </button>
                <button
                  type="button"
                  onclick={requestEdit}
                  disabled={submitting}
                  class="mt-3 block w-full cursor-pointer rounded-[14px] bg-transparent h-13.5 text-center text-[15.5px] font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                >
                  Змінити деталі
                </button>
              </div>
            {/if}
          {/each}

          {#if photoStage && !waiting}
            <!-- Анімована підказка «додай фото» (файл: static/animations/photo-upload.json) -->
            <div
              class="-my-2 flex justify-center"
              in:scale={{ duration: 300, start: 0.9, easing: quintOut }}
              out:fade={{ duration: 150 }}
            >
              <LottiePlayer src="/animations/photo-upload.json" size={250} />
            </div>
          {/if}

          {#if waiting}
            <div
              class="thinking-row flex items-center gap-2"
              in:fade={{ duration: 200 }}
              role="status"
              aria-live="polite"
            >
              <ThinkingLogo size={20} />
              <span class="thinking-text">Thinking</span>
            </div>
          {/if}
        </div>
      </div>

      {#if showScrollButton}
        <button
          type="button"
          aria-label="Прокрутити вниз"
          onclick={() => scrollToBottom()}
          class="absolute left-1/2 z-20 flex size-8 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-border/70 bg-background/90 text-foreground shadow-[0_4px_16px_-4px_rgba(0,0,0,0.35)] backdrop-blur-sm transition hover:bg-muted"
          style:bottom="{inputPanelHeight + 16}px"
          in:fade={{ duration: 150 }}
          out:fade={{ duration: 150 }}
        >
          <ArrowDown size={15} aria-hidden="true" />
        </button>
      {/if}

      <!-- Прогресивне розмиття тексту, що заходить під інпут -->
      <div
        class="pointer-events-none absolute right-1.5 bottom-0 left-0 z-9"
        style:height="{fadeZone}px"
      >
        <div class="blur-layer blur-layer-1"></div>
        <div class="blur-layer blur-layer-2"></div>
        <div class="blur-layer blur-layer-3"></div>
        <div class="blur-layer blur-layer-4"></div>
      </div>

      <!-- Інпут поверх повідомлень -->
      <div
        class="pointer-events-none absolute right-2 bottom-0 left-0 z-10 flex flex-col justify-end bg-linear-to-t from-background from-55% via-background/80 to-transparent"
        style:height="{fadeZone}px"
      >
        <div
          bind:clientHeight={inputPanelHeight}
          class="pointer-events-auto pb-3 pl-4 pr-5.5"
        >
          <div class="mx-auto flex w-full max-w-3xl flex-col gap-2">
            {#if chips.length}
              <div class="flex flex-wrap gap-2" in:fade={{ duration: 250 }}>
                {#each chips as c (c)}
                  <button
                    type="button"
                    onclick={() => pickChip(c)}
                    class="cursor-pointer rounded-full border border-border bg-card px-4 py-2 text-[13.5px] font-medium text-foreground transition-all duration-300 hover:border-primary active:scale-[0.98]"
                  >
                    {c}
                  </button>
                {/each}
              </div>
            {/if}
            <div
              class="rounded-[28px] border border-border bg-card p-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            >
              {@render pendingPreview()}
              <textarea
                bind:this={textareaEl}
                bind:value={input}
                oninput={autoResize}
                onkeydown={handleKeydown}
                rows="1"
                placeholder="Напиши Zunor..."
                disabled={waiting || submitting}
                style:max-height="{inputMaxH}px"
                class="job-input-plain block w-full resize-none px-2 py-1.5 text-[15px] leading-snug"
              ></textarea>
              <div class="mt-1 flex items-center justify-between gap-2">
                {@render photoButton()}
                <div class="flex items-center gap-2">
                  <span
                    class="rounded-full border border-border bg-background px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground"
                    style="background: var(--bg-translucent);"
                  >
                    Прибирання · Одеса
                  </span>
                  <button
                    type="button"
                    onclick={send}
                    disabled={waiting ||
                      submitting ||
                      uploading ||
                      (!input.trim() && !pendingPhotos.length)}
                    aria-label="Надіслати"
                    class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-white transition disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .thinking-text {
    font-size: 15px;
    line-height: 1;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--muted-foreground) 55%, transparent) 0%,
      var(--foreground) 50%,
      color-mix(in srgb, var(--muted-foreground) 55%, transparent) 100%
    );
    background-size: 250% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: thinking-shimmer 1.8s ease-in-out infinite;
  }
  @keyframes thinking-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -100% 0;
    }
  }

  .blur-layer {
    position: absolute;
    inset: 0;
    -webkit-backdrop-filter: blur(var(--blur-amount));
    backdrop-filter: blur(var(--blur-amount));
  }
  .blur-layer-1 {
    --blur-amount: 0.5px;
    mask-image: linear-gradient(
      to bottom,
      transparent 0%,
      black 45%,
      black 100%
    );
    -webkit-mask-image: linear-gradient(
      to bottom,
      transparent 0%,
      black 45%,
      black 100%
    );
  }
  .blur-layer-2 {
    --blur-amount: 2px;
    mask-image: linear-gradient(
      to bottom,
      transparent 25%,
      black 55%,
      black 100%
    );
    -webkit-mask-image: linear-gradient(
      to bottom,
      transparent 25%,
      black 55%,
      black 100%
    );
  }
  .blur-layer-3 {
    --blur-amount: 6px;
    mask-image: linear-gradient(
      to bottom,
      transparent 45%,
      black 70%,
      black 100%
    );
    -webkit-mask-image: linear-gradient(
      to bottom,
      transparent 45%,
      black 70%,
      black 100%
    );
  }
  .blur-layer-4 {
    --blur-amount: 14px;
    mask-image: linear-gradient(to bottom, transparent 65%, black 90%);
    -webkit-mask-image: linear-gradient(to bottom, transparent 65%, black 90%);
  }

  .scroll-area {
    scrollbar-width: thin;
    scrollbar-gutter: stable;
    scrollbar-color: color-mix(
        in srgb,
        var(--muted-foreground) 35%,
        transparent
      )
      transparent;
    mask-image: linear-gradient(
      to bottom,
      black calc(100% - var(--fade-zone, 200px)),
      transparent 100%
    );
    -webkit-mask-image: linear-gradient(
      to bottom,
      black calc(100% - var(--fade-zone, 200px)),
      transparent 100%
    );
  }
  .scroll-area::-webkit-scrollbar {
    width: 6px;
  }
  .scroll-area::-webkit-scrollbar-track {
    background: transparent;
  }
  .scroll-area::-webkit-scrollbar-thumb {
    background-color: color-mix(
      in srgb,
      var(--muted-foreground) 35%,
      transparent
    );
    border-radius: 999px;
  }
  .scroll-area::-webkit-scrollbar-thumb:hover {
    background-color: color-mix(
      in srgb,
      var(--muted-foreground) 55%,
      transparent
    );
  }

  .job-scope :global(.job-input-plain) {
    border: none;
    background: transparent;
    color: var(--foreground);
    outline: none;
    max-height: 160px;
    overflow-y: auto;
    font-family: inherit;
    scrollbar-width: thin;
    scrollbar-color: color-mix(
        in srgb,
        var(--muted-foreground) 35%,
        transparent
      )
      transparent;
  }
  .job-scope :global(.job-input-plain::placeholder) {
    color: var(--muted-foreground);
  }

  @media (prefers-reduced-motion: reduce) {
    .job-scope :global(*) {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
