<script lang="ts">
  import {
    Sparkles,
    Star,
    Check,
    Clock,
    Home,
    Building2,
    Briefcase,
    Boxes,
    MousePointer2,
  } from 'lucide-svelte'
  import { fade, fly, crossfade } from 'svelte/transition'
  import { cubicOut, backOut } from 'svelte/easing'

  const steps = [
    {
      title: 'Опишіть завдання',
      text: '5 кроків — і заявка готова. Шукати майстра самостійно не потрібно.',
    },
    {
      title: 'Клінери відгукуються',
      text: 'Клінери поруч самі пишуть ціну та зручний час.',
    },
    {
      title: 'Оберіть — і чекайте',
      text: 'Ви обираєте виконавця. Він приїжджає й прибирає.',
    },
  ]

  // Реалістична адресна строка під кожен крок майстра.
  const urls = [
    { prefix: 'zunor.org/dashboard/jobs/', id: 'new' },
    { prefix: 'zunor.org/dashboard/jobs/', id: 'cmri2z2230001hku6usd8in4z' },
    { prefix: 'zunor.org/dashboard/orders/', id: 'cmri4clqp000bhku6h74in0c8' },
  ]

  const DURATION = 5200

  let active = $state(0)
  let stepProgress = $state(0)
  let paused = $state(false)

  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  $effect(() => {
    active
    stepProgress = 0
    let raf: number
    let elapsed = 0
    let last = performance.now()

    function frame(now: number) {
      if (!paused) {
        elapsed += now - last
        stepProgress = Math.min(elapsed / DURATION, 1)
      }
      last = now
      if (stepProgress >= 1) {
        active = (active + 1) % steps.length
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  })

  function select(i: number) {
    active = i
  }

  const premises = [
    { label: 'Квартира', icon: Building2 },
    { label: 'Дім', icon: Home },
    { label: 'Офіс', icon: Briefcase },
    { label: 'Інше', icon: Boxes },
  ]

  const proposals = [
    {
      name: 'Марина К.',
      rating: 4.9,
      reviews: 214,
      price: '850 ₴',
      badge: null,
      gradient: 'linear-gradient(135deg, #8b7cf6 0%, #6366f1 100%)',
    },
    {
      name: 'Олег П.',
      rating: 4.8,
      reviews: 96,
      price: '780 ₴',
      badge: null,
      gradient: 'linear-gradient(135deg, #fb923c 0%, #ef4444 100%)',
    },
    {
      name: 'Ірина С.',
      rating: null,
      reviews: 0,
      price: '720 ₴',
      badge: 'Новачок',
      gradient: 'linear-gradient(135deg, #34d399 0%, #06b6d4 100%)',
    },
  ]

  // Shared-element transition: аватар обраного майстра "перелітає" зі списку
  // пропозицій (крок 2) у підтвердження (крок 3) замість різкого перемикання.
  const [send, receive] = crossfade({
    duration: reduceMotion ? 0 : 550,
    easing: cubicOut,
    fallback(_node, _params) {
      return {
        duration: reduceMotion ? 0 : 360,
        easing: cubicOut,
        css: (t) => `opacity: ${t}; transform: scale(${0.9 + t * 0.1})`,
      }
    },
  })

  const flyIn = { y: 14, duration: reduceMotion ? 0 : 460, easing: backOut }
  const flyOut = { y: -8, duration: reduceMotion ? 0 : 240, easing: cubicOut }

// ─── Крок 1 — живий чат із Zunor: репліки з'являються самі ───
  // Сценарій демо. user — бульбашка клієнта, zunor — відповідь ІІ (друкується),
  // chips — кнопки-варіанти під відповіддю (як у реальному чаті).
  type ChatBeat =
    | { role: 'user'; text: string }
    | { role: 'zunor'; text: string; chips?: string[] }

  const CHAT_SCRIPT: ChatBeat[] = [
    { role: 'user', text: 'Треба прибрати квартиру після ремонту' },
    {
      role: 'zunor',
      text: 'Зрозумів — прибирання після ремонту.\nСкільки кімнат?',
      chips: ['1', '2', '3', '4+'],
    },
    { role: 'user', text: '3 кімнати' },
    {
      role: 'zunor',
      text: 'Чудово. Будівельне сміття треба вивозити?',
      chips: ['Так', 'Винесу сам'],
    },
  ]

  // Показані репліки та стан друку останньої відповіді Zunor.
  let chatShown = $state<ChatBeat[]>([])
  let typedChars = $state(0) // скільки символів надруковано в поточній zunor-репліці
  let chipsVisible = $state(false)

  $effect(() => {
    if (active !== 0) return

    chatShown = []
    typedChars = 0
    chipsVisible = false

    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const wait = (ms: number) =>
      new Promise<void>((r) => timers.push(setTimeout(r, ms)))

    async function play() {
      await wait(400)
      for (const beat of CHAT_SCRIPT) {
        if (cancelled) return

        if (beat.role === 'user') {
          chatShown = [...chatShown, beat]
          await wait(650)
        } else {
          // Пауза «Zunor думає», далі друк по символах.
          chatShown = [...chatShown, { ...beat, text: '' }]
          typedChars = 0
          await wait(reduceMotion ? 0 : 550)
          const full = beat.text
          for (let c = 1; c <= full.length; c++) {
            if (cancelled) return
            typedChars = c
            await wait(reduceMotion ? 0 : 22)
          }
          if (beat.chips) {
            await wait(250)
            chipsVisible = true
          }
          await wait(700)
        }
      }
    }

    play()
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  })

  // Останню zunor-репліку рендеримо з урахуванням друку.
  const chatRender = $derived(
    chatShown.map((b, i) => {
      const isLast = i === chatShown.length - 1
      if (b.role === 'zunor' && isLast) {
        return { ...b, text: b.text.slice(0, typedChars), typing: typedChars < b.text.length }
      }
      return { ...b, typing: false }
    }),
  )

  // ─── Крок 2 — демо-курсор сам обирає пропозицію клінера ───
  const S2_START = { left: '104%', top: '112%' }
  const S2_TARGET = { left: '82%', top: '13%' } // над ціною першої пропозиції
  const S2_EXIT = { left: '128%', top: '-10%' }

  let selectedProposalIndex = $state(0)
  let proposalSelected = $state(-1)
  let cursor2Visible = $state(false)
  let cursor2Pressed = $state(false)
  let cursor2Pos = $state(S2_START)

  $effect(() => {
    if (active !== 1) return

    proposalSelected = -1
    cursor2Visible = false
    cursor2Pressed = false
    cursor2Pos = S2_START

    const timers = [
      setTimeout(() => {
        cursor2Visible = true
      }, 500),
      setTimeout(() => {
        cursor2Pos = S2_TARGET
      }, 620),
      setTimeout(() => {
        cursor2Pressed = true
        proposalSelected = 0
        selectedProposalIndex = 0
      }, 1350),
      setTimeout(() => {
        cursor2Pressed = false
      }, 1620),
      setTimeout(() => {
        cursor2Pos = S2_EXIT
      }, 2050),
      setTimeout(() => {
        cursor2Visible = false
      }, 2750),
    ]

    return () => timers.forEach(clearTimeout)
  })

  const chosen = $derived(proposals[selectedProposalIndex])
</script>

<section
  aria-labelledby="how-it-works-heading"
  class="px-[clamp(20px,5vw,56px)] py-[clamp(56px,7vw,96px)] text-foreground"
>
  <div class="mx-auto max-w-270">
    <header class="mb-[clamp(44px,6vw,42px)] max-w-150">
      <h2
        id="how-it-works-heading"
        class="mb-1 text-[clamp(30px,4vw,46px)] leading-[1.06] font-bold tracking-[-0.035em] text-balance"
      >
        Знайомтеся: Zunor
      </h2>
    </header>

    <div
      class="grid grid-cols-1 items-center gap-14 min-[900px]:grid-cols-2 min-[900px]:gap-16"
      onmouseenter={() => (paused = true)}
      onmouseleave={() => (paused = false)}
      role="group"
      aria-label="Кроки замовлення"
    >
      <!-- macOS-вікно — без додаткового декоративного блоку навколо -->
      <div class="flex h-[460px] items-center justify-center">
        <div
          class="relative flex h-[440px] w-full max-w-[540px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_30px_70px_-18px_rgba(0,0,0,0.1)] ring-1 ring-black/[0.03]"
        >
          <!-- «Шапка вікна» — світлофор macOS + жива адресна строка -->
          <div
            class="flex shrink-0 items-center gap-2 border-b border-border/70 bg-muted/40 px-3.5 py-2.5"
          >
            <span class="traffic-dot traffic-red"></span>
            <span class="traffic-dot traffic-yellow"></span>
            <span class="traffic-dot traffic-green"></span>
            <div
              class="ml-3 flex min-w-0 flex-1 items-center overflow-hidden rounded-md bg-background/60 px-2.5 py-1"
            >
              {#key active}
                <span
                  class="flex min-w-0 items-center font-mono text-[10px]"
                  in:fade={{ duration: reduceMotion ? 0 : 220 }}
                >
                  <span class="shrink-0 text-muted-foreground/75"
                    >{urls[active].prefix}</span
                  ><span class="min-w-0 truncate text-muted-foreground/40"
                    >{urls[active].id}</span
                  >
                </span>
              {/key}
            </div>
          </div>

          <div class="relative min-h-0 flex-1">
            {#key active}
              <div
                class="absolute inset-0 flex flex-col p-7"
                in:fly={flyIn}
                out:fly={flyOut}
              >
           {#if active === 0}
                  <!-- Крок 1: живий чат із Zunor -->
                  <div class="mb-3 flex items-center gap-2">
                    <span
                      class="flex size-6 items-center justify-center rounded-lg bg-primary/12 text-primary"
                    >
                      <Sparkles size={13} aria-hidden="true" />
                    </span>
                    <span class="text-[12.5px] font-semibold text-foreground">Zunor</span>
                    <span class="text-[11px] text-muted-foreground">оформлює заявку</span>
                  </div>

                  <div class="flex flex-1 flex-col justify-end gap-2 overflow-hidden">
                    {#each chatRender as m, i (i)}
                      {#if m.role === 'user'}
                        <div
                          class="max-w-[78%] self-end rounded-2xl rounded-br-md bg-primary px-3 py-2 text-[12.5px] leading-snug text-primary-foreground"
                          in:fly={{ y: 8, duration: reduceMotion ? 0 : 300, easing: backOut }}
                        >
                          {m.text}
                        </div>
                      {:else}
                        <div
                          class="max-w-[82%] self-start rounded-2xl rounded-bl-md border border-border bg-background px-3 py-2 text-[12.5px] leading-snug whitespace-pre-line text-foreground"
                          in:fly={{ y: 8, duration: reduceMotion ? 0 : 300, easing: backOut }}
                        >
                          {m.text}<!--
                          -->{#if m.typing}<span class="type-caret">▍</span>{/if}
                        </div>
                      {/if}
                    {/each}

                    <!-- Чіпси під останньою відповіддю Zunor -->
                    {#if chipsVisible}
                      {@const last = CHAT_SCRIPT.filter((b) => b.role === 'zunor').at(-1)}
                      {#if last && 'chips' in last && last.chips}
                        <div
                          class="mt-0.5 flex flex-wrap gap-1.5 self-start"
                          in:fly={{ y: 6, duration: reduceMotion ? 0 : 260, easing: backOut }}
                        >
                          {#each last.chips as chip, ci (chip)}
                            <span
                              class="chip-in rounded-full border border-primary/30 bg-primary/[0.06] px-2.5 py-1 text-[11.5px] font-medium text-primary"
                              style:animation-delay="{ci * 60}ms"
                            >
                              {chip}
                            </span>
                          {/each}
                        </div>
                      {/if}
                    {/if}
                  </div>
                {:else if active === 1}
                  <!-- Крок 2: пропозиції від клінерів — мінімум елементів -->
                  <div class="mb-3 flex items-center justify-between">
                    <span
                      class="text-[11.5px] font-semibold text-muted-foreground"
                      >Пропозиції на заявку</span
                    >
                    <span class="text-[11px] font-medium text-primary"
                      >3 нові</span
                    >
                  </div>
                  <div class="flex flex-1 flex-col justify-center">
                    <div class="relative flex flex-col gap-2">
                      {#each proposals as o, i (o.name)}
                        <div
                          class="flex items-center gap-2.5 rounded-xl border p-2.5 transition-colors duration-300 {i ===
                          proposalSelected
                            ? 'border-primary/50 bg-primary/[0.04]'
                            : 'border-border bg-background'}"
                        >
                          <div
                            class="relative shrink-0"
                            out:send={{
                              key:
                                i === selectedProposalIndex
                                  ? 'chosen-avatar'
                                  : `discard-${o.name}`,
                            }}
                          >
                            <span
                              class="flex size-9 items-center justify-center rounded-full text-[12.5px] font-semibold text-white"
                              style:background={o.gradient}
                            >
                              {o.name[0]}
                            </span>
                            {#if i === proposalSelected}
                              <span
                                class="badge-pop absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card"
                              >
                                <Check size={8} aria-hidden="true" />
                              </span>
                            {/if}
                          </div>
                          <div class="min-w-0 flex-1">
                            <p
                              class="truncate text-[12.5px] font-semibold text-foreground"
                            >
                              {o.name}
                            </p>
                            {#if o.rating}
                              <div
                                class="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"
                              >
                                <Star
                                  size={10}
                                  class="fill-current text-amber-400"
                                  aria-hidden="true"
                                />
                                {o.rating} · {o.reviews}
                              </div>
                            {:else}
                              <span
                                class="mt-0.5 block text-[11px] text-[#10b981]"
                                >Новачок</span
                              >
                            {/if}
                          </div>
                          <span
                            class="shrink-0 text-[12.5px] font-semibold text-foreground"
                            >{o.price}</span
                          >
                        </div>
                      {/each}

                      <!-- Демо-курсор: наводиться на пропозицію, клікає й іде геть -->
                      {#if cursor2Visible}
                        <div
                          class="pointer-events-none absolute z-10 transition-[left,top,opacity] duration-700 motion-reduce:transition-none"
                          style:left={cursor2Pos.left}
                          style:top={cursor2Pos.top}
                          style:opacity={cursor2Pos === S2_EXIT ? 0 : 1}
                          style:transition-timing-function="cubic-bezier(0.34,1.56, 0.64, 1)"
                          aria-hidden="true"
                        >
                          {#if cursor2Pressed}
                            <span
                              class="cursor-ripple absolute -inset-2.5 rounded-full bg-primary/25"
                            ></span>
                          {/if}
                          <MousePointer2
                            size={19}
                            class="text-foreground drop-shadow-md transition-transform duration-150 {cursor2Pressed
                              ? 'scale-90'
                              : 'scale-100'}"
                            strokeWidth={2}
                            fill="var(--card)"
                          />
                        </div>
                      {/if}
                    </div>
                  </div>
                {:else}
                  <!-- Крок 3: підтверджено саме того клінера, якого обрали на кроці 2 -->
                  <span
                    class="mb-3 text-[11.5px] font-semibold text-muted-foreground"
                    >Ваш вибір</span
                  >
                  <div
                    class="flex flex-1 flex-col items-center justify-center gap-3 text-center"
                  >
                    <div
                      class="relative"
                      in:receive={{ key: 'chosen-avatar' }}
                      out:send={{ key: 'chosen-avatar' }}
                    >
                      <span
                        class="flex size-14 items-center justify-center rounded-full text-lg font-semibold text-white shadow-md ring-2 ring-primary ring-offset-2 ring-offset-card"
                        style:background={chosen.gradient}
                      >
                        {chosen.name[0]}
                      </span>
                      <span
                        class="badge-pop absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card"
                      >
                        <Check size={11} aria-hidden="true" />
                      </span>
                    </div>
                    <div>
                      <p class="text-[14px] font-semibold text-foreground">
                        {chosen.name}
                      </p>
                      <div
                        class="mt-0.5 flex items-center justify-center gap-1 text-[11.5px] text-muted-foreground"
                      >
                        {#if chosen.rating}
                          <Star
                            size={11}
                            class="fill-current text-amber-400"
                            aria-hidden="true"
                          />
                          {chosen.rating} · {chosen.reviews} відгуків
                        {:else}
                          <Sparkles size={11} aria-hidden="true" />
                          Новий клінер
                        {/if}
                      </div>
                    </div>
                    <span
                      class="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11.5px] font-medium text-foreground"
                    >
                      <Clock size={11} aria-hidden="true" />
                      Сьогодні, 18:00
                    </span>
                  </div>
                  <p
                    class="mt-auto text-center text-[11px] text-muted-foreground"
                  >
                    Контакти відкрито — можна писати напряму
                  </p>
                {/if}
              </div>
            {/key}
          </div>
        </div>
      </div>

      <!-- Текстовий список кроків -->
      <div class="w-full space-y-8">
        {#each steps as step, i (step.title)}
          <button
            type="button"
            tabindex="0"
            aria-pressed={active === i}
            onclick={() => select(i)}
            class="cursor-pointer text-start transition-opacity duration-200 ease-out {active ===
            i
              ? 'opacity-100'
              : 'opacity-50'}"
          >
            <h3
              class="mb-2 text-3xl leading-[1.1] font-semibold tracking-tight md:text-4xl"
            >
              {step.title}
            </h3>
            <p class="text-lg leading-snug text-foreground">
              {step.text}
            </p>
          </button>
        {/each}
      </div>
    </div>
  </div>
</section>

<style>
  /* macOS traffic lights — реальні кольори Apple, плаский заливок + hairline */
  .traffic-dot {
    display: inline-block;
    width: 11px;
    height: 11px;
    border-radius: 9999px;
    box-shadow:
      inset 0 0.5px 0.5px rgba(255, 255, 255, 0.35),
      inset 0 0 0 0.5px rgba(0, 0, 0, 0.16);
  }
  .traffic-red {
    background: #ff5f57;
  }
  .traffic-yellow {
    background: #ffbd2e;
  }
  .traffic-green {
    background: #28c840;
  }

  @keyframes zunor-cursor-ripple {
    0% {
      transform: scale(0.35);
      opacity: 0.55;
    }
    100% {
      transform: scale(2.1);
      opacity: 0;
    }
  }
  .cursor-ripple {
    animation: zunor-cursor-ripple 550ms ease-out;
  }

  /* Rubber / spring pop — лишили тільки для кроку 1 (карток приміщення) */
  @keyframes zunor-rubber-pop {
    0% {
      transform: scale(1);
    }
    40% {
      transform: scale(1.045);
    }
    70% {
      transform: scale(0.985);
    }
    100% {
      transform: scale(1);
    }
  }
  .rubber-pop {
    animation: zunor-rubber-pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes zunor-badge-pop {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    60% {
      transform: scale(1.15);
      opacity: 1;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
  .badge-pop {
    animation: zunor-badge-pop 380ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

/* Курсор друку в останній репліці Zunor */
  .type-caret {
    display: inline-block;
    margin-left: 1px;
    color: var(--primary);
    animation: zunor-caret 1s steps(1) infinite;
  }
  @keyframes zunor-caret {
    0%, 50% { opacity: 1; }
    50.01%, 100% { opacity: 0; }
  }

  /* Поява чіпсів «пружиною» з каскадом */
  @keyframes zunor-chip-in {
    0% { transform: translateY(6px) scale(0.9); opacity: 0; }
    100% { transform: translateY(0) scale(1); opacity: 1; }
  }
  .chip-in {
    animation: zunor-chip-in 320ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  @media (prefers-reduced-motion: reduce) {
    .cursor-ripple,
    .rubber-pop,
    .badge-pop,
    .type-caret,
    .chip-in {
      animation: none;
    }
  }
</style>
