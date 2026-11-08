<!--
  Перший екран лендингу — за першим екраном Lovable (розміри зняті з їхньої
  розмітки): заголовок, сірий підзаголовок і велике поле вводу по центру.
  Поле — головна кнопка сторінки: Zunor і є чат, тож перша дія на сайті та
  сама, що в застосунку, — написати, що прибрати.

  Текст — пояснення, а не гасло: що це (AI-сервіс), для чого (замовити
  клінінг), де (Одеса) і що з цього людині (без пошуку й дзвінків,
  ціну пропонують самі). Заголовок побудований як у конкурента
  («Онлайн-сервіс замовлення послуг у м. Одеса») — так людина з пошуку
  одразу впізнає, куди потрапила, — але з тим, що нас відрізняє: AI.

  Поле справжнє. Клієнт у сесії одразу потрапляє в чат із цим текстом
  (`/dashboard/jobs/new?q=…` сам починає розмову). Гість — на реєстрацію,
  а текст чекає його в `$lib/zunor/pending-task` і підхоплюється на
  `/dashboard` після входу.

  Тло — велике розмите серце, як у Lovable, у наших кольорах і з зерном
  (hero-glow): доли здіймаються до країв, ложбинка — під полем.

  Заголовок — Manrope: у Lovable тут їхній власний шрифт без кирилиці.
-->
<script lang="ts">
  import '@fontsource-variable/manrope'
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { scale } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import toast from 'svelte-hot-french-toast'
  import ArrowUp from '$lib/components/icons/set/arrow-up.svelte'
  import Plus from '$lib/components/icons/set/plus.svelte'
  import Mic from '$lib/components/icons/set/mic.svelte'
  import Square from '$lib/components/icons/set/square.svelte'
  import * as Tooltip from '$lib/components/ui/tooltip'
  import HeroGlow from './hero-glow.svelte'
  import { Dictation } from '$lib/zunor/dictation.svelte'
  import {
    PENDING_TASK_MAX,
    savePendingTask,
  } from '$lib/zunor/pending-task'

  // Плейсхолдер друкує приклади, як у Lovable («Ask Lovable to create…»).
  const PREFIX = 'Треба '
  const EXAMPLES = [
    'прибрати квартиру після ремонту…',
    'помити вікна на балконі…',
    'почистити диван від плям…',
    'зробити генеральне прибирання…',
  ]

  let text = $state('')
  // На сервері й без JS — перший приклад цілком, а не порожнє «Треба ».
  let placeholder = $state(PREFIX + EXAMPLES[0])
  let field = $state<HTMLTextAreaElement | null>(null)

  const isLoggedIn = $derived(!!page.data.session?.user)
  const canSend = $derived(text.trim().length > 0)

  /** Далі — у чат (клієнт у сесії) або на реєстрацію (гість). */
  function openChat(task: string) {
    dictation.stop()
    if (isLoggedIn) {
      goto(
        task
          ? `/dashboard/jobs/new?q=${encodeURIComponent(task)}`
          : '/dashboard/jobs/new',
      )
    } else {
      if (task) savePendingTask(task)
      goto('/user/register')
    }
  }

  function submit(event?: SubmitEvent) {
    event?.preventDefault()
    const task = text.trim()
    if (!task) {
      field?.focus()
      return
    }
    openChat(task)
  }

  // «+» — фото, як у чаті. Без акаунта їх нікуди вантажити (Cloudinary
  // підписує лише для сесії), тож кнопка веде туди, де фото додаються:
  // у чат із уже написаним текстом або на реєстрацію.
  function addPhotos() {
    openChat(text.trim())
  }

  // ─── Голосовий ввід — той самий, що в чаті ───
  // Розпізнане дописується до вже набраного, а не затирає його.
  let dictationBase = ''
  const dictation = new Dictation({
    onChange: (transcript) => {
      text = dictationBase ? `${dictationBase} ${transcript}` : transcript
      resize()
    },
    onError: (message) => toast.error(message),
  })

  function toggleMic() {
    if (dictation.listening) {
      dictation.stop()
      return
    }
    dictationBase = text.trim()
    dictation.start()
    field?.focus()
  }

  // Підтримку мови знає лише браузер: на сервері кнопки мікрофона немає,
  // і малюємо її тільки після монтування — інакше розмітка сервера й
  // браузера розійшлась би на гідратації.
  let mounted = $state(false)
  onMount(() => {
    mounted = true
    return () => dictation.destroy()
  })

  function onKeydown(event: KeyboardEvent) {
    // Enter — надіслати, Shift+Enter — новий рядок, як у чаті.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  function resize() {
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${Math.min(field.scrollHeight, 200)}px`
  }

  onMount(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let stopped = false
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

    ;(async () => {
      let i = 0
      while (!stopped) {
        // Постояти, стерти приклад, надрукувати наступний.
        await sleep(2200)
        const current = EXAMPLES[i]
        i = (i + 1) % EXAMPLES.length
        const next = EXAMPLES[i]
        for (let n = current.length - 1; n >= 0; n--) {
          if (stopped) return
          placeholder = PREFIX + current.slice(0, n)
          await sleep(18)
        }
        for (let n = 1; n <= next.length; n++) {
          if (stopped) return
          placeholder = PREFIX + next.slice(0, n)
          await sleep(next[n - 1] === ' ' ? 90 : 45)
        }
      }
    })()

    return () => {
      stopped = true
    }
  })
</script>

<section
  aria-labelledby="hero-title"
  class="hero relative flex min-h-[calc(100svh-60px)] flex-col items-center justify-center overflow-hidden px-6 py-16"
>
  <HeroGlow />

  <div class="relative flex w-full flex-col items-center">
    <div class="mb-7 flex flex-col items-center text-center md:mb-9">
      <h1
        id="hero-title"
        class="font-['Manrope_Variable',sans-serif] text-[32px] leading-[1.1] font-semibold tracking-[-1.28px] text-balance text-[#202020] md:text-[48px] md:tracking-[-1.92px]"
      >
        <span class="ai">AI</span>-сервіс замовлення клінінгу в&nbsp;Одесі
      </h1>
      <p
        class="mt-3 max-w-[34ch] text-[16px] leading-6 text-pretty text-[#4a4a4a] md:max-w-none md:text-[18px] md:leading-7"
      >
        <!-- Один рядок, що лише доповнює заголовок, як у Lovable. -->
        Опиши, що прибрати, а клінера ми знайдемо самі.
      </p>
    </div>

    <form class="group/composer relative w-full max-w-[38rem]" onsubmit={submit}>
      <!-- Кольорова смужка під полем, коли в ньому курсор — як у Lovable. -->
      <div
        aria-hidden="true"
        class="composer-halo pointer-events-none absolute inset-x-6 bottom-1 h-2 rounded-full opacity-0 blur-[6px] transition-opacity duration-200 group-focus-within/composer:opacity-100"
      ></div>

      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="relative flex cursor-text flex-col rounded-[28px] border border-white bg-field p-3 shadow-[0_25px_50px_-12px_#00000040] ring-1 ring-black/8 transition-[box-shadow,border-color] hover:ring-black/12 focus-within:ring-black/16 dark:border-white/8 dark:ring-black/90"
        onclick={() => field?.focus()}
      >
        <textarea
          bind:this={field}
          bind:value={text}
          oninput={resize}
          onkeydown={onKeydown}
          rows="1"
          maxlength={PENDING_TASK_MAX}
          {placeholder}
          aria-label="Що потрібно прибрати"
          class="max-h-50 min-h-10 w-full resize-none bg-transparent px-2 pt-2 pb-1 text-[16px] leading-6 text-foreground outline-none placeholder:text-[#202020]/45 dark:placeholder:text-foreground/45"
        ></textarea>

        <!-- Ряд кнопок як у Lovable: «+» ліворуч, мікрофон і надсилання
             праворуч. Поведінка — як у панелі чату застосунку: стрілка
             зʼявляється, лише коли є що надсилати. -->
        <Tooltip.Provider delayDuration={150}>
          <div class="flex items-center gap-1">
            <Tooltip.Root>
              <Tooltip.Trigger
                type="button"
                onclick={addPhotos}
                aria-label="Додати фото"
                class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-black/10 text-foreground shadow-[0_2px_2px_-1px_#0000000a] transition-[background-color,transform] duration-150 hover:bg-black/4 active:scale-[0.96] dark:border-white/15 dark:hover:bg-white/8"
              >
                <Plus class="size-5" strokeWidth={1.75} aria-hidden="true" />
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom" sideOffset={6} arrowClasses="hidden">
                Додати фото
              </Tooltip.Content>
            </Tooltip.Root>

            <span class="ml-auto flex items-center gap-2">
              <!-- Без підтримки розпізнавання (Firefox) кнопки немає зовсім. -->
              {#if mounted && dictation.supported}
                <Tooltip.Root>
                  <Tooltip.Trigger
                    type="button"
                    onclick={toggleMic}
                    aria-label={dictation.listening
                      ? 'Зупинити запис'
                      : 'Продиктувати голосом'}
                    class={[
                      'flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-[0.96]',
                      dictation.listening
                        ? 'mic-live bg-destructive/10 text-destructive'
                        : 'text-foreground hover:bg-black/4 dark:hover:bg-white/8',
                    ]}
                  >
                    {#if dictation.listening}
                      <Square class="size-4" strokeWidth={2.5} aria-hidden="true" />
                    {:else}
                      <Mic class="size-5" strokeWidth={1.75} aria-hidden="true" />
                    {/if}
                  </Tooltip.Trigger>
                  <Tooltip.Content side="bottom" sideOffset={6} arrowClasses="hidden">
                    {dictation.listening ? 'Зупинити запис' : 'Продиктувати голосом'}
                  </Tooltip.Content>
                </Tooltip.Root>
              {/if}

              {#if canSend}
                <div in:scale={{ duration: 140, start: 0.8, easing: quintOut }}>
                  <Tooltip.Root>
                    <Tooltip.Trigger
                      type="submit"
                      aria-label="Надіслати"
                      class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-white transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.96]"
                    >
                      <ArrowUp class="size-4.5" aria-hidden="true" />
                    </Tooltip.Trigger>
                    <Tooltip.Content side="bottom" sideOffset={6} arrowClasses="hidden">
                      Надіслати
                    </Tooltip.Content>
                  </Tooltip.Root>
                </div>
              {/if}
            </span>
          </div>
        </Tooltip.Provider>
      </div>
    </form>
  </div>
</section>

<style>
  /* Палітра першого екрана — від зовнішнього шару тла до ядра
     (hero-glow): синій край, фіолетовий, орхідея й яскраво-рожеве ядро.
     Кольори зняті піпеткою з банера Lovable. Нею ж — смуга по «AI» й
     підсвітка під полем. */
  .hero {
    --glow-1: #3a5ad6;
    --glow-2: #7b66ee;
    --glow-3: #f872dc;
    --glow-4: #ff4a9e;
  }

  /* «AI» у заголовку — звичайний текст. Трохи після завантаження по ньому
     один раз повільно пропливає зліва направо кольорова смуга в кольорах
     тла (синій → фіолетовий → рожевий) — і все. Краї смуги
     широкі й мʼякі, хід — синусоїдою: смуга не «бігає», а пропливає.

     Як: під час анімації літери прозорі й показують градієнт, у якого
     обидва краї — колір заголовка, а смуга посередині. Фон їде так, що
     смуга проходить слово, тож на початку й у кінці літери виглядають
     звичайними — заміна прозорого кольору на справжній не видна. Поза
     анімацією це просто текст (і так само зі «зменшити рух»). */
  .ai {
    --ai-ink: #202020;
    color: var(--ai-ink);
    background: linear-gradient(
        90deg,
        var(--ai-ink) 0%,
        var(--ai-ink) 30%,
        var(--glow-1) 40%,
        var(--glow-2) 47%,
        var(--glow-3) 53%,
        var(--glow-4) 60%,
        var(--ai-ink) 70%,
        var(--ai-ink) 100%
      )
      100% 50% / 400% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    animation: ai-sweep 3.2s cubic-bezier(0.37, 0, 0.63, 1) 1.2s;
  }
  :global(.dark) .ai {
    --ai-ink: var(--foreground);
  }
  /* 100% → 0% зсуває малюнок праворуч — смуга йде зліва направо. */
  @keyframes ai-sweep {
    from {
      color: transparent;
      background-position: 100% 50%;
    }
    to {
      color: transparent;
      background-position: 0% 50%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ai {
      animation: none;
    }
  }

  /* Мікрофон під час запису пульсує, як у чаті. */
  :global(.mic-live) {
    animation: mic-pulse 1.6s ease-in-out infinite;
  }
  @keyframes mic-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.55;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.mic-live) {
      animation: none;
    }
  }

  .composer-halo {
    background: linear-gradient(
      90deg,
      var(--glow-1) 0%,
      var(--glow-2) 50%,
      var(--glow-3) 100%
    );
  }
</style>
