<script lang="ts">
  import { ArrowUp, Mic, Plus } from 'lucide-svelte'
  import { fade, fly } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import { goto } from '$app/navigation'
  import GradientHeart from '../gradient-heart.svelte'

  let input = $state('')
  let textareaEl: HTMLTextAreaElement | undefined = $state()

  const canSend = $derived(input.trim().length > 0)

  // ─── Друкований плейсхолдер ───
  const PHRASE_PREFIX = 'Треба '
  const PHRASES = [
    'прибрати квартиру...',
    'помити вікна...',
    'хімчистка дивана...',
    'генеральне прибирання...',
    'прибрати після ремонту...',
  ]
  const TYPE_MS = 40
  const SPACE_EXTRA_MS = 50
  const HOLD_MS = 1500
  const ERASE_MS = 18
  const GAP_MS = 200

  let placeholder = $state(PHRASE_PREFIX)

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  $effect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      placeholder = PHRASE_PREFIX + PHRASES[0]
      return
    }

    let cancelled = false

    async function run() {
      let i = 0
      while (!cancelled) {
        const suffix = PHRASES[i]

        for (let c = 1; c <= suffix.length && !cancelled; c++) {
          placeholder = PHRASE_PREFIX + suffix.slice(0, c)
          const jitter = Math.random() * 40
          const extra = suffix[c - 1] === ' ' ? SPACE_EXTRA_MS : 0
          await sleep(TYPE_MS + jitter + extra)
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

  function autoResize() {
    if (!textareaEl) return
    textareaEl.style.height = 'auto'
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, 160)}px`
  }

  // Текст гостя доїжджає до чату: jobs/new читає ?q=. Весь redirectTo
  // енкодимо цілком, інакше внутрішній ?q= обріжеться при вході.
  function goToChat() {
    if (!canSend) return
    const target = `/dashboard/jobs/new?q=${encodeURIComponent(input.trim())}`
    goto(`/user/login?redirectTo=${encodeURIComponent(target)}`)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      goToChat()
    }
  }
</script>

<section
  class="relative -mt-14 flex min-h-svh w-full flex-col items-center justify-center overflow-hidden bg-background px-4 pt-14 sm:px-8"
  aria-label="Головний екран"
>
  <!-- Градієнтний фон -->
  <div
    class="pointer-events-none absolute inset-0 z-0 flex items-end justify-center overflow-hidden"
    aria-hidden="true"
  >
    <div
      class="grad-box translate-y-1/3"
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

  <div
    class="relative z-1 mx-auto flex w-full max-w-2xl flex-col items-center text-center"
  >
    <!-- Заголовок -->
    <h1
      class="text-[40px] leading-[1.05] font-bold tracking-[-0.03em] text-balance text-foreground sm:text-[64px]"
      in:fly={{ y: 12, duration: 450, easing: quintOut }}
    >
      Клінінг в Одесі
    </h1>

    <!-- Підзаголовок -->
    <p
      class="mt-5 text-[16px] leading-relaxed text-pretty text-muted-foreground sm:mt-2 sm:text-[19px]"
      in:fly={{ y: 12, duration: 450, delay: 60, easing: quintOut }}
    >
      Замовляйте прибирання разом з AI
    </p>

    <!-- Інпут -->
    <div
      class="mt-4 w-full sm:mt-5"
      in:fly={{ y: 12, duration: 450, delay: 120, easing: quintOut }}
    >
      <div
        class="hero-shell flex cursor-text flex-col rounded-2xl bg-card transition-shadow duration-200"
      >
        <div class="flex flex-col gap-3 px-4 py-3.5">
          <textarea
            bind:this={textareaEl}
            bind:value={input}
            oninput={autoResize}
            onkeydown={handleKeydown}
            rows="1"
            {placeholder}
            aria-label="Опишіть, що потрібно прибрати"
            class="hero-textarea min-h-[1.6lh] w-full resize-none bg-transparent px-1 pt-1 text-left text-[15.5px] leading-relaxed text-foreground outline-none"
          ></textarea>

          <div class="flex items-center justify-between">
            <!-- «+» неактивна для гостя: ghost-стиль, підказка на hover -->
            <span class="tip group relative inline-flex">
              <button
                type="button"
                disabled
                aria-label="Увійдіть, щоб додати фото"
                class="grid size-8 cursor-not-allowed place-items-center rounded-lg text-muted-foreground opacity-40"
              >
                <Plus size={18} strokeWidth={2} aria-hidden="true" />
              </button>
              <span role="tooltip" class="tip-bubble left-0">
                Увійдіть, щоб додати фото
              </span>
            </span>

            <div class="flex items-center gap-0.5">
              <!-- Мікрофон: неактивний, натяк на голосовий ввід -->
              <span class="tip group relative inline-flex">
                <button
                  type="button"
                  disabled
                  aria-label="Голосовий ввід — скоро"
                  class="grid size-8 cursor-not-allowed place-items-center rounded-lg text-muted-foreground opacity-40"
                >
                  <Mic size={18} strokeWidth={2} aria-hidden="true" />
                </button>
                <span role="tooltip" class="tip-bubble right-0">Скоро</span>
              </span>

              <!-- Надіслати: єдина активна, primary-акцент -->
              <button
                type="button"
                onclick={goToChat}
                disabled={!canSend}
                aria-label="Оформити заявку"
                class="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg bg-primary text-[color:var(--primary-foreground)] transition-[transform,opacity,background-color] duration-150 hover:bg-[var(--primary-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--card)] focus-visible:outline-none active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowUp size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  .hero-textarea::placeholder {
    color: var(--muted-foreground);
  }

  .hero-shell {
    box-shadow:
      0 1px 3px color-mix(in srgb, black 4%, transparent),
      0 0 0 1px var(--border);
  }
  .hero-shell:focus-within {
    box-shadow:
      0 4px 16px color-mix(in srgb, black 7%, transparent),
      0 0 0 1px color-mix(in srgb, var(--foreground) 28%, transparent);
  }

  .tip-bubble {
    position: absolute;
    bottom: 100%;
    margin-bottom: 0.5rem;
    width: max-content;
    white-space: nowrap;
    border-radius: 0.5rem;
    border: 1px solid var(--border);
    background: var(--card);
    padding: 0.375rem 0.625rem;
    font-size: 12px;
    font-weight: 500;
    color: var(--foreground);
    box-shadow: 0 4px 12px color-mix(in srgb, black 8%, transparent);
    opacity: 0;
    pointer-events: none;
    transition: opacity 150ms ease;
  }
  .tip:hover .tip-bubble {
    opacity: 1;
  }
</style>
