<script lang="ts">
  import {
    ArrowUp,
    Mic,
    Plus,
    Sparkles,
    Grid2x2,
    Sofa,
    PaintRoller,
    Ellipsis,
  } from 'lucide-svelte'
  import { fly } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import { goto } from '$app/navigation'

  // ─── Підказки ───
  // Тип іконки виводимо з реального компонента — без any і без здогадок
  // про назви типів, які lucide експортує.
  interface Suggestion {
    label: string
    icon: typeof Sparkles
  }

  const SUGGESTIONS: readonly Suggestion[] = [
    { label: 'Прибрати квартиру', icon: Sparkles },
    { label: 'Помити вікна', icon: Grid2x2 },
    { label: 'Хімчистка', icon: Sofa },
    { label: 'Після ремонту', icon: PaintRoller },
    { label: 'Інше', icon: Ellipsis },
  ]

  // ─── Друкований плейсхолдер ───
  const PHRASE_PREFIX = 'Треба '
  const PHRASES = [
    'прибрати квартиру...',
    'помити вікна...',
    'хімчистка дивана...',
    'генеральне прибирання...',
    'прибрати після ремонту...',
  ] as const

  const TYPE_MS = 40
  const SPACE_EXTRA_MS = 50
  const HOLD_MS = 1500
  const ERASE_MS = 18
  const GAP_MS = 200
  const TEXTAREA_MAX_PX = 180

  let input = $state('')
  let textareaEl: HTMLTextAreaElement | undefined = $state()
  let placeholder = $state(PHRASE_PREFIX)

  const canSend = $derived(input.trim().length > 0)

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  $effect(() => {
    // Анімований плейсхолдер — декорація. Для prefers-reduced-motion
    // показуємо статичну фразу й нічого не запускаємо.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      placeholder = PHRASE_PREFIX + PHRASES[0]
      return
    }

    // cancelled читається всередині циклів: без нього async-цикл
    // переживе розмонтування компонента й писатиме в мертвий стан.
    let cancelled = false

    async function run() {
      let i = 0
      while (!cancelled) {
        const suffix = PHRASES[i]

        for (let c = 1; c <= suffix.length && !cancelled; c++) {
          placeholder = PHRASE_PREFIX + suffix.slice(0, c)
          // Пауза після пробілу довша — так набір читається як людський.
          const extra = suffix[c - 1] === ' ' ? SPACE_EXTRA_MS : 0
          await sleep(TYPE_MS + Math.random() * 40 + extra)
        }
        if (cancelled) break
        await sleep(HOLD_MS)

        for (let c = suffix.length; c >= 0 && !cancelled; c--) {
          placeholder = PHRASE_PREFIX + suffix.slice(0, c)
          await sleep(ERASE_MS + Math.random() * 12)
        }
        if (cancelled) break
        await sleep(GAP_MS)

        i = (i + 1) % PHRASES.length
      }
    }

    run()
    return () => {
      cancelled = true
    }
  })

  function autoResize(): void {
    if (!textareaEl) return
    textareaEl.style.height = 'auto'
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, TEXTAREA_MAX_PX)}px`
  }

  function fillAndFocus(text: string): void {
    input = text
    textareaEl?.focus()
    autoResize()
  }

  // Текст гостя доїжджає до чату: jobs/new читає ?q=. redirectTo енкодимо
  // цілком, інакше внутрішній ?q= обріжеться при вході.
  function goToChat(): void {
    if (!canSend) return
    const target = `/dashboard/jobs/new?q=${encodeURIComponent(input.trim())}`
    goto(`/user/login?redirectTo=${encodeURIComponent(target)}`)
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      goToChat()
    }
  }
</script>

<!-- Секція займає стільки, скільки потрібно контенту: ніяких min-h-svh.
     Вертикальний ритм задають лише відступи. -->
<section
  class="relative isolate w-full overflow-hidden bg-background px-4 py-14 sm:py-20"
  aria-label="Головний екран"
>
  <div class="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
    <h1
      class="text-[clamp(1.75rem,4vw,2.25rem)] leading-[1.1] font-semibold tracking-[-0.03em] text-balance text-foreground"
      in:fly={{ y: 12, duration: 450, easing: quintOut }}
    >
      Замовте клінінг в Одесі
    </h1>

    <p
      class="mt-3 text-[1.0625rem] text-pretty text-muted-foreground"
      in:fly={{ y: 12, duration: 450, delay: 60, easing: quintOut }}
    >
      Опишіть завдання — AI підбере майстра, ціну й час.
    </p>

    <div
      class="mt-8 w-full"
      in:fly={{ y: 12, duration: 450, delay: 120, easing: quintOut }}
    >
      <!-- Обгортка інпута -->
      <div
        class="flex cursor-text flex-col rounded-[1.75rem] border border-border bg-card shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-[box-shadow,border-color] duration-200 hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)] focus-within:border-foreground/20 focus-within:shadow-[0_6px_20px_rgba(0,0,0,0.08)]"
      >
        <div class="flex flex-col gap-2 px-5 pt-[1.15rem] pb-[0.85rem]">
          <textarea
            bind:this={textareaEl}
            bind:value={input}
            oninput={autoResize}
            onkeydown={handleKeydown}
            rows="1"
            {placeholder}
            aria-label="Опишіть, що потрібно прибрати"
            class="min-h-[2.4lh] w-full resize-none bg-transparent px-1 pt-0.5 text-left text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          ></textarea>

          <div class="flex items-center justify-between">
            <!-- «+» неактивна для гостя -->
            <span class="group relative inline-flex">
              <button
                type="button"
                disabled
                aria-label="Увійдіть, щоб додати фото"
                class="grid size-9 cursor-not-allowed place-items-center rounded-xl text-muted-foreground opacity-45"
              >
                <Plus size={20} strokeWidth={2} aria-hidden="true" />
              </button>
              <span
                role="tooltip"
                class="pointer-events-none absolute bottom-full left-0 mb-2 w-max rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-foreground opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-opacity duration-150 group-hover:opacity-100"
              >
                Увійдіть, щоб додати фото
              </span>
            </span>

            <div class="flex items-center gap-0.5">
              <!-- Мікрофон -->
              <span class="group relative inline-flex">
                <button
                  type="button"
                  disabled
                  aria-label="Голосовий ввід — скоро"
                  class="grid size-9 cursor-not-allowed place-items-center rounded-full text-muted-foreground opacity-45"
                >
                  <Mic size={20} strokeWidth={2} aria-hidden="true" />
                </button>
                <span
                  role="tooltip"
                  class="pointer-events-none absolute right-0 bottom-full mb-2 w-max rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-foreground opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-opacity duration-150 group-hover:opacity-100"
                >
                  Скоро
                </span>
              </span>

              <!-- Надіслати -->
              <button
                type="button"
                onclick={goToChat}
                disabled={!canSend}
                aria-label="Оформити заявку"
                class="grid size-9 shrink-0 place-items-center rounded-xl transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none enabled:cursor-pointer enabled:bg-primary enabled:text-primary-foreground enabled:active:scale-95 enabled:hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground"
              >
                <ArrowUp size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Підказки: клік підставляє текст і фокусує поле -->
      <div class="mt-[1.1rem] flex flex-wrap justify-center gap-2.5">
        {#each SUGGESTIONS as item (item.label)}
          <button
            type="button"
            onclick={() => fillAndFocus(item.label)}
            class="group inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card py-2.5 pr-4 pl-3 text-sm font-medium text-foreground transition-colors duration-150 hover:border-foreground/15 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <item.icon
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              class="shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-foreground"
            />
            {item.label}
          </button>
        {/each}
      </div>
    </div>
  </div>
</section>
