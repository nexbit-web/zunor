<script lang="ts">
  import { onMount, tick } from 'svelte'
  import ArrowUp from '@lucide/svelte/icons/arrow-up'
  import ArrowDown from '@lucide/svelte/icons/arrow-down'
  import Check from '@lucide/svelte/icons/check'
  import Copy from '@lucide/svelte/icons/copy'
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
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right'
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
  import toast from 'svelte-hot-french-toast'
  import MessageBody from '$lib/components/zunor/MessageBody.svelte'

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

  // Фото дозволені ЗАВЖДИ. Раніше кнопка «+» відмикалась лише коли модель
  // видала чіпс «Додати фото» — якщо вона просила фото текстом без рядка
  // >>>, клієнт не міг нічого прикріпити, і діалог зациклювався на кроці 6.
  const photosAllowed = true
  // Фото-стадія: Zunor саме зараз пропонує фото → пульсуємо кнопкою «+»
  let photoStage = $derived(chips.some(isAddPhotoChip))
  // Іконки рядків summary — ті самі імена, що віддає describeJob
  const ROW_ICONS: Record<string, typeof ClipboardCheck> = {
    Home,
    Building,
    Sparkles,
    Calendar,
    DoorOpen,
    ArrowUpDown,
    ArrowLeftRight,
    Trash2,
    Repeat,
    AppWindow,
    Columns2,
  }
  function rowIcon(name?: string): typeof ClipboardCheck {
    return (name && ROW_ICONS[name]) || ClipboardCheck
  }

  // Чіпси приходять мовою клієнта («Додати фото» / «Добавить фото»),
  // тому порівнюємо за змістом, а не за точним рядком.
  // «без» відсікає «Продовжити без фото».
  function isAddPhotoChip(label: string): boolean {
    const s = label.toLowerCase()
    return s.includes('фото') && !s.includes('без')
  }

  // Hero росте вище (більше місця на екрані), чатовий — до 260px, далі скрол
  let inputMaxH = $derived(started ? 260 : 300)

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
        updateSpacer()
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

  // bind:clientHeight оновлюється через ResizeObserver, НЕ синхронно з tick():
  // після зміни контенту панелі чекаємо подвійний rAF, і лише тоді скролимо —
  // і тільки якщо юзер і так був біля низу.
  function nextFrame() {
    return new Promise<void>((res) =>
      requestAnimationFrame(() => requestAnimationFrame(() => res())),
    )
  }

  // Надіслане повідомлення стає під верх вьюпорта і ЛИШАЄТЬСЯ там: відповідь
  // росте вниз, ми не женемося за низом. Спейсер під списком дає фізичне
  // місце, щоб якір міг піднятися нагору.
  const TOP_GAP = 24
  let anchorId = $state<number | null>(null)
  let spacerHeight = $state(0)
  let spacerEl = $state<HTMLDivElement | undefined>(undefined)

  function anchorEl(): HTMLElement | null {
    if (!scrollEl || anchorId === null) return null
    return scrollEl.querySelector<HTMLElement>(`[data-msg-id="${anchorId}"]`)
  }

  function updateSpacer() {
    const anchor = anchorEl()
    if (!scrollEl || !spacerEl || !anchor) {
      spacerHeight = 0
      return
    }
    // Контент від якоря до спейсера (сам спейсер не рахуємо)
    const used =
      spacerEl.getBoundingClientRect().top - anchor.getBoundingClientRect().top
    const room = scrollEl.clientHeight - TOP_GAP - fadeZone
    // Не ріжемо спейсер нижче поточної позиції скролу — інакше браузер
    // підтягне вьюпорт угору і текст «стрибне» посеред стріму.
    const contentH = scrollEl.scrollHeight - spacerHeight
    const keepScroll = scrollEl.scrollTop + scrollEl.clientHeight - contentH
    spacerHeight = Math.max(0, Math.round(Math.max(room - used, keepScroll)))
  }

  /** Ставить якір під верх вьюпорта. */
  async function scrollAnchorToTop() {
    await tick()
    updateSpacer()
    await nextFrame()
    const anchor = anchorEl()
    if (!scrollEl || !anchor) return
    const top =
      scrollEl.scrollTop +
      anchor.getBoundingClientRect().top -
      scrollEl.getBoundingClientRect().top -
      TOP_GAP
    scrollEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    setTimeout(handleScroll, 60)
    setTimeout(handleScroll, 400)
  }

  /** Показує КІНЕЦЬ реального контенту (спейсер не рахуємо) — фото-крок, Lottie. */
  async function revealContentEnd(force = false) {
    await tick()
    updateSpacer()
    await nextFrame()
    if (!scrollEl || !spacerEl) return
    const end =
      scrollEl.scrollTop +
      spacerEl.getBoundingClientRect().top -
      scrollEl.getBoundingClientRect().top
    const top = Math.max(0, end - scrollEl.clientHeight + fadeZone + TOP_GAP)
    // Тільки вниз: не смикаємо юзера нагору, якщо він і так усе бачить
    if (force || top > scrollEl.scrollTop) {
      scrollEl.scrollTo({ top, behavior: 'smooth' })
    }
    setTimeout(handleScroll, 400)
  }

  function handleScroll() {
    if (!scrollEl) return
    // Низ = кінець контенту БЕЗ спейсера, інакше стрілка «вниз» світиться
    // весь час, хоча знизу лише порожнє місце.
    const distance =
      scrollEl.scrollHeight -
      spacerHeight -
      scrollEl.scrollTop -
      scrollEl.clientHeight
    showScrollButton = distance > 120
  }

  async function focusInput() {
    await tick()
    textareaEl?.focus()
  }

  // Кліки по кнопках/прев'ю/самому textarea не перехоплюємо.
  function focusFromShell(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('button, a, img, input, textarea')) return
    e.preventDefault() // не збиваємо каретку/виділення
    textareaEl?.focus()
  }

  // ─── Діалог з агентом ───

  /** Історія для API: user + повні тексти zunor (без summary-карток). */
  function apiHistory(): ZunorClientMessage[] {
    return messages.flatMap((m): ZunorClientMessage[] => {
      if (m.role === 'user') {
        // Маркер про фото — лише для моделі, в UI показуються превʼю
        const suffix = m.images?.length
          ? `\n[attachment: ${m.images.length} photo]`
          : ''
        return [{ role: 'user', content: (m.text + suffix).trim() }]
      }
      if (m.role === 'zunor') {
        const content = m.text.trim()
        return content ? [{ role: 'assistant' as const, content }] : []
      }
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
    await revealContentEnd()

    const speed = text.length > 160 ? 6 : text.length > 80 ? 10 : 14
    for (let i = 1; i <= text.length; i++) {
      await sleep(speed)
      messages = messages.map((m) =>
        m.role === 'zunor' && m.id === id ? { ...m, shown: i } : m,
      )
      await tick()
      updateSpacer()
    }
    messages = messages.map((m) =>
      m.role === 'zunor' && m.id === id ? { ...m, typing: false } : m,
    )
    await revealContentEnd()
  }

  // Читає NDJSON-потік: dispatch по подіях. onText — кожен шматок тексту.
  // Повертає фінальний ZunorResponse (draft/suggestions/reply).
  async function readStream(
    res: Response,
    onText: (delta: string) => void,
  ): Promise<ZunorResponse | null> {
    if (!res.body) return null
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let final: ZunorResponse | null = null

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // неповний рядок лишаємо на наступний тік
        for (const line of lines) {
          const s = line.trim()
          if (!s) continue
          let evt: { t: string; d?: string; r?: ZunorResponse }
          try {
            evt = JSON.parse(s)
          } catch {
            continue
          }
          if (evt.t === 'text' && evt.d) onText(evt.d)
          else if (evt.t === 'final' && evt.r) final = evt.r
        }
      }
    } finally {
      reader.releaseLock()
    }
    return final
  }

  /** Ховає рядок «>>> ...» під час стріму: чіпси показуються кнопками,
      а не текстом. Хвіст-огризок ('>' або '>>') теж ріжемо, щоб не блимав. */
  /** Markdown-маркери → протокольне «— ». Дублює серверний
      normalizeListMarkers: сервер чистить лише фінал, а під час стріму
      клієнт малює сирий текст — інакше зірочки видно, поки друкується. */
  function normalizeMarkers(text: string): string {
    return text.replace(/^[ \t]*[*\-•][ \t]+/gm, '— ')
  }

  function visibleText(raw: string): string {
    const idx = raw.indexOf('>>>')
    const body =
      idx !== -1
        ? raw.slice(0, idx).trimEnd()
        : (() => {
            const tail = raw.match(/>{1,2}$/)
            return tail ? raw.slice(0, raw.length - tail[0].length) : raw
          })()
    return normalizeMarkers(body)
  }

  async function advance(userText: string) {
    const text = userText.trim()
    if ((!text && pendingPhotos.length === 0) || waiting || submitting) return
    if (uploading) return

    const photos = pendingPhotos
    pendingPhotos = []
    sentPhotos = [...sentPhotos, ...photos]

    const userId = msgId++
    messages = [
      ...messages,
      {
        id: userId,
        role: 'user',
        text,
        images: photos.length ? photos.map((p) => p.url) : undefined,
      },
    ]
    anchorId = userId
    chips = []
    input = ''
    resetTextareaHeight()
    await scrollAnchorToTop()

    waiting = true
    const t0 = Date.now()

    const zunorId = msgId++
    let streamStarted = false
    let spacerRaf = 0
    let rawStream = ''

    const ensureBubble = () => {
      if (streamStarted) return
      streamStarted = true
      waiting = false
      const thinkSeconds = Math.max(1, Math.round((Date.now() - t0) / 1000))
      messages = [
        ...messages,
        {
          id: zunorId,
          role: 'zunor',
          text: '',
          shown: 0,
          typing: true,
          thinkSeconds,
        },
      ]
    }

    const appendText = (delta: string) => {
      ensureBubble()
      rawStream += delta
      const shownText = visibleText(rawStream)
      messages = messages.map((m) =>
        m.role === 'zunor' && m.id === zunorId
          ? { ...m, text: shownText, shown: shownText.length }
          : m,
      )
      if (!spacerRaf) {
        spacerRaf = requestAnimationFrame(() => {
          spacerRaf = 0
          updateSpacer()
        })
      }
    }

    try {
      const res = await fetch('/api/zunor/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ messages: apiHistory() }),
      })

      if (!res.ok) {
        waiting = false
        messages = messages.filter((m) => m.id !== zunorId)
        const errData = (await res.json().catch(() => null)) as {
          message?: string
        } | null
        await focusInput()
        await pushZunor(
          errData?.message ??
            (res.status === 429
              ? 'Забагато запитів. Спробуй трохи пізніше.'
              : 'Щось пішло не так. Спробуй ще раз.'),
          1,
        )
        return
      }

      const final = await readStream(res, appendText)
      await focusInput()

      const cleanReply = final && 'reply' in final ? final.reply : undefined
      messages = messages.map((m) => {
        if (m.role !== 'zunor' || m.id !== zunorId) return m
        const finalText = cleanReply ?? m.text
        return { ...m, text: finalText, shown: finalText.length, typing: false }
      })

      if (!streamStarted) {
        messages = messages.filter((m) => m.id !== zunorId)
        waiting = false
      }

      if (!final) {
        if (!streamStarted)
          await pushZunor('Щось пішло не так. Спробуй ще раз.', 1)
        return
      }

      if (final.kind === 'message' && final.suggestions?.length) {
        chips = final.suggestions
        await revealContentEnd()
      } else {
        updateSpacer()
      }

      if (final.kind === 'draft') {
        const summaryId = msgId++
        if (!streamStarted && final.reply) await pushZunor(final.reply, 1)
        messages = [
          ...messages.filter((m) => m.role !== 'summary'),
          { id: summaryId, role: 'summary', draft: final.draft },
        ]
        anchorId = summaryId
        await scrollAnchorToTop()
      }
    } catch {
      waiting = false
      messages = messages.filter((m) => m.id !== zunorId)
      await focusInput()
      await pushZunor(
        "Помилка з'єднання. Перевір інтернет і спробуй ще раз.",
        1,
      )
    } finally {
      if (spacerRaf) cancelAnimationFrame(spacerRaf)
    }
    await focusInput()
  }

  function send() {
    advance(input)
  }

  function pickChip(label: string) {
    if (isAddPhotoChip(label)) {
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
    updateSpacer()
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
    const next = Math.min(textareaEl.scrollHeight, inputMaxH)
    textareaEl.style.height = next + 'px'
    // Скрол з'являється ЛИШЕ коли текст переріс стелю
    textareaEl.style.overflowY =
      textareaEl.scrollHeight > inputMaxH ? 'auto' : 'hidden'
  }

  function resetTextareaHeight() {
    requestAnimationFrame(() => {
      if (!textareaEl) return
      textareaEl.style.height = 'auto'
      textareaEl.style.overflowY = 'hidden'
    })
  }

  async function copyText(id: number, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      copiedId = id
      setTimeout(() => (copiedId = null), 1500)
      toast.success('Скопійовано', { duration: 1500 })
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

    const ro = new ResizeObserver(() => {
      handleScroll()
      updateSpacer()
    })

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
            'flex size-8 shrink-0 items-center justify-center rounded-xl transition-[background-color,color,transform] duration-150 active:scale-[0.96]',
            photosAllowed && !uploading
              ? 'cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground'
              : 'cursor-not-allowed text-muted-foreground/40',
          ]}
        >
          <Plus size={18} strokeWidth={2} aria-hidden="true" />
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
      <!-- pt/px тут власні: хрестики зміщені на -6px і мусять мати запас,
           інакше впираються в край оболонки -->
      <div class="flex flex-col gap-1.5 px-3.5 pt-3.5">
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
                  class="size-16 rounded-xl object-cover"
                />
                <button
                  type="button"
                  onclick={() => removePending(i)}
                  aria-label="Прибрати фото {i + 1}"
                  class="absolute -top-1.5 -right-1.5 flex size-5.5 cursor-pointer items-center justify-center rounded-lg border border-white/20 bg-black/70 text-white shadow backdrop-blur-sm transition-transform hover:scale-110 active:scale-95"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            {/each}
            {#if uploading}
              <div
                class="flex size-16 items-center justify-center rounded-xl border-[1.5px] border-dashed border-border bg-muted"
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
        class="mb-4 flex size-16 items-center justify-center rounded-lg bg-primary text-primary-foreground"
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
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="job-input-shell border border-border flex cursor-text flex-col rounded-[20px] bg-card"
          onmousedown={focusFromShell}
        >
          {@render pendingPreview()}

          <div class="flex flex-col gap-4 px-4 py-4">
            <textarea
              bind:this={textareaEl}
              bind:value={input}
              oninput={autoResize}
              onkeydown={handleHeroKeydown}
              rows="1"
              placeholder={heroPlaceholder}
              disabled={waiting}
              style:max-height="{inputMaxH}px"
              class="job-input-plain min-h-[2lh] w-full resize-none bg-transparent px-1.5 pt-1 text-[16px] leading-relaxed"
            ></textarea>

            <div class="flex items-center gap-2">
              {@render photoButton()}
              <div class="grow"></div>
              <span
                class="job-chip-city rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground"
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
                class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-primary hover:primary-hover text-white transition-[transform,opacity] duration-150 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-30"
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
              class="cursor-pointer rounded-xl border border-border bg-card px-4 py-2 text-[13.5px] font-medium text-foreground transition-all duration-300 hover:bg-muted active:scale-[0.98]"
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
                data-msg-id={m.id}
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
              <div data-msg-id={m.id} in:fade={{ duration: 220 }}>
                <p class="mb-2 text-[13px] text-muted-foreground">
                  Thought for {m.thinkSeconds}s
                </p>
                <MessageBody
                  text={m.text.slice(0, m.shown)}
                  typing={m.typing}
                />
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
              <!-- ─── Summary-картка драфту від Zunor ─── -->
              <div
                data-msg-id={m.id}
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
                  class="relative mt-1.5 inline-flex h-13.5 w-full items-center justify-center rounded-[16px] bg-primary text-[15.5px] font-semibold tracking-[-0.01em] text-primary-foreground transition hover:-translate-y-px hover:bg-primary-hover active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
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

          {#if photoStage && !waiting && !uploading && !pendingPhotos.length}
            <div
              class="-my-2 flex justify-center"
              in:scale={{ duration: 300, start: 0.9, easing: quintOut }}
              out:scale={{ duration: 420, start: 0.94, easing: quintOut }}
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
          <!-- Місце під якір: дозволяє останньому повідомленню стати вгорі -->
          <div
            bind:this={spacerEl}
            aria-hidden="true"
            style:height="{spacerHeight}px"
          ></div>
        </div>
      </div>

      {#if showScrollButton}
        <button
          type="button"
          aria-label="Прокрутити вниз"
          onclick={() => revealContentEnd(true)}
          class="absolute left-1/2 z-20 flex size-8 -translate-x-1/2 cursor-pointer items-center justify-center rounded-lg border border-border/70 bg-background/90 text-foreground shadow-[0_4px_16px_-4px_rgba(0,0,0,0.35)] backdrop-blur-sm transition hover:bg-muted"
          style:bottom="{inputPanelHeight + 16}px"
          in:fade={{ duration: 150 }}
          out:fade={{ duration: 150 }}
        >
          <ArrowDown size={15} aria-hidden="true" />
        </button>
      {/if}

      <!-- Інпут поверх повідомлень -->
      <div class="pointer-events-none absolute right-0 bottom-0 left-0 z-10">
        <div
          bind:clientHeight={inputPanelHeight}
          class="pointer-events-auto px-4 pb-3"
        >
          <div class="mx-auto flex w-full max-w-3xl flex-col">
            <!-- Обгортка завжди в DOM: висота анімується grid-рядком,
                 інакше панель стрибає і чіпси залітають у текст. -->
            <div class="chips-wrap" class:chips-open={chips.length > 0}>
              <div class="min-h-0 overflow-hidden">
                <div class="flex flex-wrap gap-2 pb-2">
                  {#each chips as c, i (c)}
                    <button
                      type="button"
                      onclick={() => pickChip(c)}
                      in:fly={{
                        y: 8,
                        duration: 520,
                        delay: 180 + i * 90,
                        easing: quintOut,
                      }}
                      out:fade={{ duration: 180 }}
                      class="chip-btn cursor-pointer rounded-xl border border-border bg-card px-4 py-2 text-[13.5px] font-medium text-foreground active:scale-[0.98]"
                    >
                      {c}
                    </button>
                  {/each}
                </div>
              </div>
            </div>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="job-input-shell flex cursor-text flex-col rounded-[20px] bg-card"
              onmousedown={focusFromShell}
            >
              {@render pendingPreview()}
              <div class="flex flex-col gap-3.5 px-4 py-3.5">
                <textarea
                  bind:this={textareaEl}
                  bind:value={input}
                  oninput={autoResize}
                  onkeydown={handleKeydown}
                  rows="1"
                  placeholder="Напиши Zunor..."
                  disabled={waiting || submitting}
                  style:max-height="{inputMaxH}px"
                  class="job-input-plain block w-full resize-none px-1.5 pt-1 text-[15px] leading-relaxed"
                ></textarea>
                <div class="flex items-center gap-2">
                  {@render photoButton()}
                  <div class="grow"></div>
                  <span
                    class="job-chip-city rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground"
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
                    class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-primary hover:primary-hover text-white transition-[transform,opacity] duration-150 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-30"
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
    overflow-y: hidden;
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

  /* Оболонка інпута (Claude-style): рамки НЕМАЄ — волосяний ring 0.5px
     через box-shadow + мʼяка ambient-тінь.
     ⚠️ Тінь ЗАВЖДИ темна (--always-black), не через --foreground:
     у .dark він білий і замість тіні виходило б світіння. */
  .job-input-shell {
    --always-black: 0 0 0;
    --shell-ring: color-mix(in srgb, var(--border) 60%, transparent);
    --shell-ambient: rgb(var(--always-black) / 0.035);
    box-shadow:
      0 4px 20px var(--shell-ambient),
      0 0 0 0.5px var(--shell-ring);
    transition: box-shadow 200ms ease;
  }
  .job-input-shell:hover {
    --shell-ring: var(--border);
  }
  .job-input-shell:focus-within {
    --shell-ring: color-mix(in srgb, var(--border) 100%, var(--foreground) 15%);
    --shell-ambient: rgb(var(--always-black) / 0.075);
  }

  /* У темній темі ambient-тінь на темному тлі не читається — ring несе
     всю роботу, тому робимо його контрастнішим, а тінь глибшою. */
  :global(.dark) .job-input-shell {
    --shell-ring: color-mix(in srgb, var(--border) 90%, transparent);
    --shell-ambient: rgb(var(--always-black) / 0.25);
  }
  :global(.dark) .job-input-shell:hover {
    --shell-ring: color-mix(in srgb, var(--border) 100%, white 8%);
  }
  :global(.dark) .job-input-shell:focus-within {
    --shell-ambient: rgb(var(--always-black) / 0.4);
  }

  .job-chip-city {
    border: 1px solid var(--border);
    background: var(--bg-translucent, var(--background));
  }

  /* Тільки бордер на hover. Окремим правилом, а не transition-all:
     інакше воно конфліктує з fly/scale і на вході чіпси смикає. */
  .chip-btn {
    transition:
      border-color 400ms ease,
      transform 150ms ease;
  }
  .chip-btn:hover {
    border-color: var(--primary);
  }

  .chips-wrap {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    transition:
      grid-template-rows 420ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 280ms ease;
  }
  .chips-open {
    grid-template-rows: 1fr;
    opacity: 1;
  }
</style>
