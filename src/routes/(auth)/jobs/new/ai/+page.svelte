<script lang="ts">
  import { onMount, tick } from 'svelte'
  import {
    ArrowLeft,
    ArrowUp,
    ArrowDown,
    Plus,
    RotateCcw,
    ThumbsUp,
    ThumbsDown,
    Copy,
    MoreHorizontal,
    Check,
    Pencil,
  } from 'lucide-svelte'
  import { fly, fade, scale } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'

  // ─── Візуальний макет. Сценарій нижче — заглушка замість реального
  // виклику DeepSeek API, щоб оцінити інтерфейс окремо від бекенду. ───
  //
  // Корінь — fixed inset-0, не залежить від батьківського елементу.
  // Скролиться лише .scroll-area, інпут — авторозширювана textarea,
  // а не однорядковий input.
  //
  // Поки немає жодного повідомлення — показуємо hero-екран (started
  // === false): привітання по центру, інпут і чіпси. Щойно юзер
  // щось надсилає — started стає true і привітання "переїжджає"
  // у чат як перше готове повідомлення (без ефекту друку, бо його
  // вже прочитали на hero).
  //
  // Інпут у чат-режимі лежить ПОВЕРХ зони повідомлень (absolute,
  // всередині того ж relative-контейнера). Висота цієї плаваючої
  // панелі вимірюється в реальному часі (bind:clientHeight) і
  // прокидається як нижній padding у .scroll-area та висота
  // fade/blur-зони — тому останнє повідомлення ніколи не ховається
  // під інпутом, скільки б рядків не було в чіпсах чи полі.
  //
  // ВАЖЛИВО: bind:clientHeight оновлюється через внутрішній
  // ResizeObserver, а НЕ синхронно з tick(). Тобто коли з'являються
  // чіпси і панель фізично росте — inputPanelHeight/fadeZone/
  // padding-bottom оновляться лише на наступному кадрі. Якщо
  // скролити одразу після зміни chips, скрол відбудеться ДО того,
  // як панель виросла — і повідомлення виявиться під нею. Тому
  // після будь-якої зміни, що може змінити висоту панелі, викликаємо
  // pinIfAtBottom(), яка чекає подвійний requestAnimationFrame перед
  // скролом.
  //
  // Фокус на textarea тримається автоматично протягом усього діалогу
  // (focusInput() викликається після старту чату і після кожного
  // кроку Zunor) — не треба клікати по полю вручну між репліками.
  //
  // Плейсхолдер на hero-інпуті "друкується" по літері в людському
  // темпі (рандомізована затримка + пауза на пробілах), працює лише
  // поки не почався діалог.

  type Msg =
    | { id: number; role: 'user'; text: string }
    | {
        id: number
        role: 'zuna'
        text: string
        shown: number
        typing: boolean
        thinkSeconds: number
      }
    | { id: number; role: 'summary' }

  let messages = $state<Msg[]>([])
  let chips = $state<string[]>([])
  let input = $state('')
  let waiting = $state(false)
  let finished = $state(false)
  let started = $state(false)
  let copiedId = $state<number | null>(null)
  let showScrollButton = $state(false)
  let scrollEl: HTMLDivElement | undefined
  let textareaEl: HTMLTextAreaElement | undefined

  // Реальна висота плаваючої інпут-панелі (чіпси + поле + дисклеймер).
  // Оновлюється автоматично через bind:clientHeight при будь-якій зміні
  // контенту (поява чіпсів, перенос рядків, autoResize textarea тощо).
  let inputPanelHeight = $state(180)
  // Запас між останнім повідомленням і інпутом, щоб не впритул.
  const SAFE_GAP = 28
  let fadeZone = $derived(inputPanelHeight + SAFE_GAP)

  let msgId = 0
  const sessionTime = new Date().toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const script = [
    {
      zuna: 'Розкажи, що потрібно прибрати?',
      chips: [
        'Прибрати квартиру',
        'Хімчистка',
        'Генеральне прибирання',
        'Помити вікна',
        'Прибрати після ремонту',
        'Регулярне прибирання',
      ],
    },
    {
      zuna: 'Добре, зрозуміла. Скільки кімнат?',
      chips: ['1 кімната', '2 кімнати', '3 кімнати', '4+ кімнат'],
    },
    {
      zuna: 'І коли зручно, щоб клінер приїхав?',
      chips: ['Сьогодні', 'Завтра', 'Оберу дату сама'],
    },
    {
      zuna: 'Супер, зрозуміла. Ось що в мене вийшло — перевір, будь ласка:',
      chips: [] as string[],
      summary: true,
    },
  ]
  let turn = $state(1)

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

        // "Треба " не чіпаємо — друкується лише хвіст фрази.
        // Швидше за попередню версію (40–80мс на символ).
        for (let i = 1; i <= suffix.length && !cancelled; i++) {
          heroPlaceholder = HERO_PREFIX + suffix.slice(0, i)
          const prevChar = suffix[i - 1]
          const base = 40 + Math.random() * 40
          await sleep(prevChar === ' ' ? base + 50 : base)
        }
        if (cancelled) break
        await sleep(1500) // коротка пауза в кінці замість 1400мс

        // Стирання — теж лише хвоста.
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

  async function scrollToBottom() {
    await tick()
    scrollEl?.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' })
    // Смуз-скрол анімований, тож перевіряємо стан кнопки трохи згодом,
    // а не лише за подією 'scroll' (яка може ще не встигнути настати).
    setTimeout(handleScroll, 60)
    setTimeout(handleScroll, 400)
  }

  // Чекає, доки браузер реально перерахує layout (важливо для
  // bind:clientHeight, який оновлюється через ResizeObserver, а не
  // синхронно з tick()), і лише тоді скролить — і тільки якщо юзер
  // і так був біля низу (щоб не заважати ручному скролу вгору).
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

  // Тримає фокус на полі вводу, не вимагаючи ручного кліку між кроками.
  async function focusInput() {
    await tick()
    textareaEl?.focus()
  }

  async function pushZuna(text: string) {
    waiting = true
    await scrollToBottom()
    const thinkStart = Date.now()
    await sleep(700 + Math.random() * 900)
    waiting = false
    const thinkSeconds = Math.max(
      1,
      Math.round((Date.now() - thinkStart) / 1000),
    )

    const id = msgId++
    messages = [
      ...messages,
      { id, role: 'zuna', text, shown: 0, typing: true, thinkSeconds },
    ]
    await scrollToBottom()

    const speed = 14
    for (let i = 1; i <= text.length; i++) {
      await sleep(speed)
      messages = messages.map((m) =>
        m.role === 'zuna' && m.id === id ? { ...m, shown: i } : m,
      )
      await tick()
      // Жорсткий pin до низу на кожен символ (без анімації) — інакше
      // плавний scrollToBottom() раз на кілька символів не встигає за
      // текстом, що росте швидше за анімацію скролу.
      if (!showScrollButton && scrollEl) {
        scrollEl.scrollTop = scrollEl.scrollHeight
      }
    }
    messages = messages.map((m) =>
      m.role === 'zuna' && m.id === id ? { ...m, typing: false } : m,
    )
    if (!showScrollButton) await scrollToBottom()
  }

  async function advance(userText: string) {
    if (!userText.trim() || waiting) return
    messages = [...messages, { id: msgId++, role: 'user', text: userText }]
    chips = []
    input = ''
    resetTextareaHeight()
    await scrollToBottom()

    const step = script[turn]
    await pushZuna(step.zuna)

    if (step.summary) {
      messages = [...messages, { id: msgId++, role: 'summary' }]
      await pinIfAtBottom()
      await focusInput()
      return
    }

    chips = step.chips
    turn++
    // Панель інпуту щойно виросла на висоту чіпсів — доскролити,
    // коли браузер реально перерахує layout, а не одразу.
    await pinIfAtBottom()
    await focusInput()
  }

  function pick(label: string) {
    advance(label)
  }

  function send() {
    advance(input)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // ─── Hero (стартовий екран, поки started === false) ───
  async function startChat(text: string) {
    if (!text.trim() || started || waiting) return
    started = true
    input = ''
    resetTextareaHeight()
    await tick()
    // Привітання вже було прочитане на hero-екрані — додаємо його як
    // готове повідомлення одразу, без ефекту друку.
    messages = [
      {
        id: msgId++,
        role: 'zuna',
        text: script[0].zuna,
        shown: script[0].zuna.length,
        typing: false,
        thinkSeconds: 1,
      },
    ]
    await focusInput()
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
    textareaEl.style.height = Math.min(textareaEl.scrollHeight, 160) + 'px'
  }

  function resetTextareaHeight() {
    requestAnimationFrame(() => {
      if (textareaEl) textareaEl.style.height = 'auto'
    })
  }

  function confirmOrder() {
    finished = true
  }

  async function copyText(id: number, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      copiedId = id
      setTimeout(() => (copiedId = null), 1500)
    } catch {
      // clipboard недоступний — тихо ігноруємо, це не критично
    }
  }

  onMount(() => {
    document.body.style.overflow = 'hidden'

    // ─── Автозапуск чату, якщо прийшли з головної з готовим текстом ───
    const initialQuery = $page.url.searchParams.get('q')
    if (initialQuery) {
      startChat(initialQuery)
      // прибираємо ?q= з адресного рядка, щоб при F5 діалог не стартував заново
      goto('/jobs/new/ai', {
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

<div
  class="job-scope fixed inset-0 z-0 flex flex-col overflow-hidden bg-background"
>
  <!-- ── Невеликий кольоровий градієнт вгорі екрану ───────────────────
       Тонка смужка, лежить лише поки триває hero-екран (як на
       референсі), не розтягується на весь фон. -->
  {#if !started}
    <div class="top-glow" aria-hidden="true" out:fade={{ duration: 300 }}></div>
  {/if}

  <!-- header -->
  <div
    class="relative z-10 flex shrink-0 items-center justify-between px-4 py-3.5"
  >
    <a
      href="/"
      class="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted-foreground transition-opacity hover:opacity-60"
    >
      <ArrowLeft class="size-4" aria-hidden="true" />
      Головна
    </a>
  </div>

  {#if finished}
    <div
      class="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center"
      in:scale={{ duration: 400, start: 0.85, easing: quintOut }}
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
    <!-- ─── HERO: показується, поки немає жодного повідомлення ─── -->
    <div
      class="flex flex-1 flex-col items-center justify-center px-4"
      in:fade={{ duration: 250 }}
    >
      <div
        class="mb-7 flex max-w-md flex-col items-center gap-2 text-center"
        in:fly={{ y: 8, duration: 350, easing: quintOut }}
      >
        <!-- <Logo /> -->
        <h1 class="text-[38px] font-bold tracking-[-0.02em]">Що прибрати?</h1>

        <!-- <p class="mt-1 text-[15px] text-muted-foreground">
          Просто опиши задачу — AI оформить замовлення.
        </p> -->
      </div>

      <div
        class="flex w-full max-w-2xl flex-col gap-3 z-1"
        in:fly={{ y: 10, duration: 400, delay: 80, easing: quintOut }}
      >
        <div
          class="flex flex-col rounded-[28px] border border-border bg-muted p-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
        >
          <textarea
            bind:this={textareaEl}
            bind:value={input}
            oninput={autoResize}
            onkeydown={handleHeroKeydown}
            rows="1"
            placeholder={heroPlaceholder}
            disabled={waiting}
            class="job-input-plain flex-1 w-full resize-none bg-transparent px-2 py-2 text-[16px] leading-snug"
          ></textarea>

          <div class="flex items-center justify-between pt-2">
            <button
              type="button"
              aria-label="Додати фото"
              class=" flex size-8 items-center shadow-[0_2px_8px_rgba(0,0,0,0.06)] justify-center rounded-full border border-border bg-muted text-muted-foreground transition-all duration-150 hover:text-foreground active:scale-[0.97]"
              style="background: var(--bg-translucent);"
            >
              <Plus size={16} strokeWidth={2.1} aria-hidden="true" />
            </button>
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
                disabled={waiting || !input.trim()}
                aria-label="Надіслати"
                class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background transition disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowUp size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap justify-center gap-2">
          {#each script[0].chips as c (c)}
            <button
              type="button"
              onclick={() => heroPick(c)}
              class="cursor-pointer rounded-full border border-border bg-muted px-4 py-2 text-[13.5px] font-medium text-foreground hover:bg-muted/70 active:scale-[0.98]"
            >
              {c}
            </button>
          {/each}
        </div>
      </div>
    </div>
  {:else}
    <!-- relative-обгортка: тут і скрол повідомлень, і інпут поверх нього -->
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
                <div
                  class="w-fit max-w-[75%] border border-border rounded-3xl rounded-br-md bg-muted px-4 py-3 text-[16px] leading-5.5 whitespace-pre-wrap wrap-break-word text-foreground"
                >
                  {m.text}
                </div>
              </div>
            {:else if m.role === 'zuna'}
              <div in:fade={{ duration: 220 }}>
                <p class="mb-2 text-[13px] text-muted-foreground">
                  Thought for {m.thinkSeconds}s
                </p>
                <p
                  class="whitespace-pre-wrap wrap-break-word text-[15.5px] leading-[1.7] text-foreground"
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
                      aria-label="Перегенерувати"
                      class="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Подобається"
                      class="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ThumbsUp size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Не подобається"
                      class="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ThumbsDown size={14} aria-hidden="true" />
                    </button>
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
                    <button
                      type="button"
                      aria-label="Ще"
                      class="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <MoreHorizontal size={14} aria-hidden="true" />
                    </button>
                  </div>
                {/if}
              </div>
            {:else}
              <!-- summary card -->
              <div
                class="rounded-2xl bg-muted p-4"
                in:fly={{ y: 8, duration: 380, easing: quintOut }}
              >
                <p class="mb-3 text-[13px] font-semibold text-foreground">
                  Прибирання квартири
                </p>
                <ul class="mb-4 flex flex-col gap-1.5">
                  {#each ['2 кімнати', 'Сьогодні', 'Стандартне прибирання'] as line (line)}
                    <li
                      class="flex items-center gap-2 text-[13.5px] text-muted-foreground"
                    >
                      <Check
                        size={13}
                        class="text-primary"
                        aria-hidden="true"
                      />
                      {line}
                    </li>
                  {/each}
                </ul>
                <div class="flex gap-2">
                  <button
                    type="button"
                    onclick={confirmOrder}
                    class="inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded-xl bg-primary text-[13.5px] font-semibold text-primary-foreground transition hover:bg-primary-hover active:scale-[0.98]"
                  >
                    Підтвердити
                  </button>
                  <button
                    type="button"
                    class="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-background px-3.5 text-[13.5px] font-medium text-foreground transition-colors hover:bg-card"
                  >
                    <Pencil size={13} aria-hidden="true" />
                    Змінити
                  </button>
                </div>
              </div>
            {/if}
          {/each}

          {#if waiting}
            <div
              class="thinking-row flex items-center gap-2"
              in:fade={{ duration: 200 }}
            >
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

      <!-- Прогресивне розмиття: кілька шарів backdrop-blur з різною
           силою й різними mask-stop'ами створюють ефект поступового
           "розфокусовування" тексту, що заходить під інпут (як на iOS),
           а не різкий обрив. Шари лежать під кольоровим градієнтом.
           Обрізані праворуч на 6px (right-1.5), щоб НЕ перекривати
           скролбар .scroll-area (він саме 6px завширшки). -->
      <div
        class="pointer-events-none absolute left-0 right-1.5 bottom-0 z-9"
        style:height="{fadeZone}px"
      >
        <div class="blur-layer blur-layer-1"></div>
        <div class="blur-layer blur-layer-2"></div>
        <div class="blur-layer blur-layer-3"></div>
        <div class="blur-layer blur-layer-4"></div>
      </div>

      <!-- інпут floats поверх повідомлень; кольоровий градієнт довершує
           ефект розмиття суцільним фоном ближче до самого низу -->
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end bg-linear-to-t from-background from-55% via-background/80 to-transparent"
        style:height="{fadeZone}px"
      >
        <!-- pr-[22px] = px-4(16px) + 6px ширини скролбару .scroll-area,
             щоб max-w-3xl mx-auto тут центрувався ідентично контенту
             в скролі (в якого скролбар "з'їдає" ці ж 6px). -->
        <div
          bind:clientHeight={inputPanelHeight}
          class="pointer-events-auto pl-4 pr-5.5 pb-3"
        >
          <div class="mx-auto flex w-full max-w-3xl flex-col gap-2">
            {#if chips.length}
              <div class="flex flex-wrap gap-2" in:fade={{ duration: 250 }}>
                {#each chips as c (c)}
                  <button
                    type="button"
                    onclick={() => pick(c)}
                    class="cursor-pointer rounded-full border border-border bg-muted px-4 py-2 text-[13.5px] font-medium text-foreground hover:bg-muted/70 active:scale-[0.98]"
                  >
                    {c}
                  </button>
                {/each}
              </div>
            {/if}

            <div
              class="rounded-[28px] border border-border bg-muted p-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            >
              <textarea
                bind:this={textareaEl}
                bind:value={input}
                oninput={autoResize}
                onkeydown={handleKeydown}
                rows="1"
                placeholder="Запитай Zunor..."
                disabled={waiting}
                class="job-input-plain block w-full resize-none px-2 py-1.5 text-[15px] leading-snug"
              ></textarea>
              <div class="mt-1 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Додати фото"
                  class=" flex size-8 items-center justify-center rounded-full border border-border/70 bg-muted text-muted-foreground transition-all duration-150 hover:text-foreground active:scale-[0.97]"
                  style="background: var(--bg-translucent);"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
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
                    disabled={waiting || !input.trim()}
                    aria-label="Надіслати"
                    class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background transition disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            <!-- <p
              class="select-none text-center text-[11.5px] text-muted-foreground"
            >
              Zunor — це AI і може помилятися.
            </p> -->
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* ── Невеликий кольоровий градієнт вгорі екрану ───────────────────
     Тонка смужка на весь горизонт (як на референсі): кілька
     radial-gradient'ів різних кольорів, обрізаних невеликою висотою
     й розмитих. Не розтягується на весь фон, лежить лише під
     хедером, поки триває hero-екран. */
  .top-glow {
    position: absolute;
    top: -170px;
    left: 50%;
    transform: translateX(-50%);

    width: 50%;
    height: 260px;

    pointer-events: none;
    z-index: 0;

    background:
      radial-gradient(
        34% 180% at 14% -15%,
        rgba(249, 115, 22, 0.9),
        transparent 68%
      ),
      radial-gradient(
        34% 180% at 38% -15%,
        rgba(236, 72, 153, 0.95),
        transparent 68%
      ),
      radial-gradient(
        34% 180% at 62% -15%,
        rgba(168, 85, 247, 0.95),
        transparent 68%
      ),
      radial-gradient(
        36% 180% at 86% -15%,
        rgba(59, 130, 246, 0.9),
        transparent 70%
      );

    filter: blur(55px);
  }

  /* ── "Thinking" індикатор ──────────────────────────────────────────
     Текст отримує рухомий градієнтний "блиск" (shimmer) — читається
     як живий процес думання, а не статичний пульсуючий напис. */
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

  /* ── Прогресивне розмиття над інпутом ──────────────────────────────
     4 шари з наростаючою силою blur і зсунутими mask-стопами:
     верх зони майже різкий, низ — суцільно розмитий, перехід плавний.
     Це класичний "progressive blur" прийом (як у iOS), бо один шар
     backdrop-filter не вміє мати змінну силу розмиття по градієнту. */
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

  /* тонкий, акуратний скролбар лише для зони повідомлень.
     scrollbar-gutter: stable — резервує місце під скролбар завжди,
     навіть коли контенту не вистачає для скролу, щоб центрування
     max-w-3xl не "стрибало" в залежності від наявності скролбару. */
  .scroll-area {
    scrollbar-width: thin;
    scrollbar-gutter: stable;
    scrollbar-color: color-mix(
        in srgb,
        var(--muted-foreground) 35%,
        transparent
      )
      transparent;
    /* Легке власне затухання останніх пікселів списку (додатково до
       blur-шарів вище) — прибирає різкий обрив тексту при скролі. */
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
  .job-scope :global(.job-input-plain::-webkit-scrollbar) {
    width: 6px;
  }
  .job-scope :global(.job-input-plain::-webkit-scrollbar-track) {
    background: transparent;
  }
  .job-scope :global(.job-input-plain::-webkit-scrollbar-thumb) {
    background-color: color-mix(
      in srgb,
      var(--muted-foreground) 35%,
      transparent
    );
    border-radius: 999px;
  }
  .job-scope :global(.job-input-plain::-webkit-scrollbar-thumb:hover) {
    background-color: color-mix(
      in srgb,
      var(--muted-foreground) 55%,
      transparent
    );
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
