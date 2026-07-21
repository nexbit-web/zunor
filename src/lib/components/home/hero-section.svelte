<script lang="ts">
  import { ArrowRight, ArrowUp, MapPin, Plus } from 'lucide-svelte'
  import { fly } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import { goto } from '$app/navigation'

  let input = $state('')
  let textareaEl: HTMLTextAreaElement | undefined = $state()

  // ─── Бегущий плейсхолдер (тот же, что на /jobs/new/ai) ───
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
    let cancelled = false

    async function loop() {
      let phraseIndex = 0
      while (!cancelled) {
        const suffix = HERO_SUFFIXES[phraseIndex]

        for (let i = 1; i <= suffix.length && !cancelled; i++) {
          heroPlaceholder = HERO_PREFIX + suffix.slice(0, i)
          const prevChar = suffix[i - 1]
          const base = 40 + Math.random() * 40
          await sleep(prevChar === ' ' ? base + 50 : base)
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

  function autoResize() {
    if (!textareaEl) return
    textareaEl.style.height = 'auto'
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, 160)}px`
  }

  // ─── Переход в чат с текстом из инпута ───
  function goToChat(text = input) {
    const value = text.trim()
    if (!value) return
    goto(`/user/login`)
  }

  function handleHeroKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      goToChat()
    }
  }
</script>

<section
  class="relative -mt-14 flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background px-4 pt-14 sm:px-8"
  aria-label="Головний екран"
>
  <!-- цветной аврора-слой: мягкие размытые пятна под сеткой -->
  <div
    class="pointer-events-none absolute inset-0 overflow-hidden"
    aria-hidden="true"
  >
    <div class="hero-aurora"></div>
  </div>

  <div
    class="pointer-events-none absolute inset-0 opacity-40 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[length:48px_48px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black_40%,transparent_90%)]"
    aria-hidden="true"
  ></div>

  <div
    class="relative mx-auto flex max-w-3xl flex-col items-center text-center"
  >
    <div
      class="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground"
    >
      <MapPin class="size-4 text-primary" aria-hidden="true" />
      <span>Одеса, UA</span>
    </div>

    <h1
      class="max-w-[34ch] text-[40px] leading-[1.1] font-bold tracking-[-0.02em] text-foreground sm:text-[56px]"
    >
      Замовляйте прибирання<br class="hidden sm:block" />
      коли завгодно з Zunor
    </h1>

    <p
      class="mt-4 max-w-[42ch] text-[17px] leading-[1.6] text-muted-foreground"
    >
      Опублікуйте замовлення та оберіть клінерку, яка найкраще підходить саме
      вам.
    </p>

    <!-- chat input вместо кнопки -->
    <div
      class="mt-8 flex w-full max-w-2xl flex-col gap-3 z-1"
      in:fly={{ y: 10, duration: 400, delay: 80, easing: quintOut }}
    >
      <div
        class="flex flex-col rounded-[28px] border border-border bg-muted p-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow duration-200 focus-within:shadow-[0_4px_16px_rgba(0,0,0,0.1)]"
      >
        <textarea
          bind:this={textareaEl}
          bind:value={input}
          oninput={autoResize}
          onkeydown={handleHeroKeydown}
          rows="1"
          placeholder={heroPlaceholder}
          class="job-input-plain flex-1 w-full resize-none bg-transparent px-2 py-2 text-[16px] leading-snug text-foreground placeholder:text-muted-foreground focus:outline-none"
        ></textarea>

        <div class="flex items-center justify-between pt-2">
          <button
            type="button"
            aria-label="Додати фото"
            class="flex size-8 items-center shadow-[0_2px_8px_rgba(0,0,0,0.06)] justify-center rounded-full border border-border bg-muted text-muted-foreground transition-all duration-150 hover:text-foreground active:scale-[0.97]"
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
              onclick={() => goToChat()}
              disabled={!input.trim()}
              aria-label="Надіслати"
              class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background transition disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowUp size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  .job-input-plain::placeholder {
    color: var(--muted-foreground);
  }

  /* мягкий цветной меш: 4 больших размытых пятна, лёгкий дрейф.
     opacity низкая — это подложка под светлую тему, а не отдельный неоновый хиро */
  .hero-aurora {
    position: absolute;
    left: -10%;
    right: -10%;
    bottom: 0;
    height: 100vh;
    filter: blur(90px);
    opacity: 0.55;
    background:
      radial-gradient(
        38% 30% at 22% 18%,
        rgba(92, 126, 244, 0.55),
        transparent 70%
      ),
      radial-gradient(
        34% 26% at 68% 8%,
        rgba(249, 128, 222, 0.45),
        transparent 70%
      ),
      radial-gradient(
        42% 32% at 52% 46%,
        rgba(252, 35, 106, 0.35),
        transparent 70%
      ),
      radial-gradient(
        36% 26% at 80% 60%,
        rgba(254, 99, 39, 0.3),
        transparent 70%
      );
    animation: aurora-drift 22s ease-in-out infinite alternate;
  }

  @keyframes aurora-drift {
    0% {
      transform: translate3d(0, 0, 0) scale(1);
    }
    50% {
      transform: translate3d(-1.5%, 1.5%, 0) scale(1.03);
    }
    100% {
      transform: translate3d(1.5%, -1%, 0) scale(1);
    }
  }

  @media (prefers-color-scheme: dark) {
    .hero-aurora {
      opacity: 0.8;
    }
  }
</style>
