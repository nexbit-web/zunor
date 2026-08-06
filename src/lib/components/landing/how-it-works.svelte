<script lang="ts">
  import { Star, Check, Clock } from 'lucide-svelte'
  import { fade, fly, crossfade } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'

  // ─── Кроки ───
  interface Step {
    index: string
    title: string
    text: string
  }

  const STEPS: readonly Step[] = [
    {
      index: '01',
      title: 'Опишіть завдання',
      text: 'Zunor ставить уточнювальні питання й сам складає заявку.',
    },
    {
      index: '02',
      title: 'Виконавці відгукуються',
      text: 'Zunor надсилає заявку клінерам міста. Кожен називає власну ціну та час.',
    },
    {
      index: '03',
      title: 'Оберіть і зустріньте',
      text: 'Рейтинг і ціна видно до замовлення. Обрали — контакти відкрито.',
    },
  ]

  const DURATION = 6400

  let active = $state(0)
  let stepProgress = $state(0)

  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const T = {
    panelIn: reduceMotion ? 0 : 360,
    panelOut: reduceMotion ? 0 : 180,
    bubble: reduceMotion ? 0 : 280,
    morph: reduceMotion ? 0 : 520,
  }

  $effect(() => {
    active
    stepProgress = 0

    let raf = 0
    let elapsed = 0
    let last = performance.now()

    function frame(now: number) {
      // dt обрізаємо: повернення з фонової вкладки інакше прокрутить
      // одразу кілька кроків.
      elapsed += Math.min(now - last, 100)
      last = now
      stepProgress = Math.min(elapsed / DURATION, 1)

      if (stepProgress >= 1) {
        active = (active + 1) % STEPS.length
        return
      }
      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  })

  // ─── Демо-дані ───
  interface Proposal {
    name: string
    rating: number | null
    reviews: number
    price: string
    note: string
  }

  const PROPOSALS: readonly Proposal[] = [
    {
      name: 'Марина К.',
      rating: 4.9,
      reviews: 214,
      price: '850 ₴',
      note: 'Сьогодні, 18:00',
    },
    {
      name: 'Олег П.',
      rating: 4.8,
      reviews: 96,
      price: '780 ₴',
      note: 'Завтра, 10:00',
    },
    {
      name: 'Ірина С.',
      rating: null,
      reviews: 0,
      price: '720 ₴',
      note: 'Завтра, 14:00',
    },
  ]

  const CHOSEN_INDEX = 0
  const chosen = $derived(PROPOSALS[CHOSEN_INDEX])

  // Аватар обраного виконавця перетікає зі списку в підтвердження —
  // єдиний рух, що несе зміст: це та сама людина, а не інша картка.
  const [send, receive] = crossfade({
    duration: T.morph,
    easing: cubicOut,
    fallback: () => ({
      duration: T.panelIn,
      easing: cubicOut,
      css: (t: number) => `opacity: ${t}`,
    }),
  })

  // ─── Крок 1: чат ───
  type ChatBeat =
    | { role: 'user'; text: string }
    | { role: 'zunor'; text: string; chips?: readonly string[] }

  const CHAT_SCRIPT: readonly ChatBeat[] = [
    { role: 'user', text: 'Треба прибрати квартиру після ремонту' },
    {
      role: 'zunor',
      text: 'Зрозумів — прибирання після ремонту.\nСкільки кімнат?',
      chips: ['1', '2', '3', '4+'],
    },
    { role: 'user', text: '3 кімнати' },
    { role: 'zunor', text: 'Готово. Надсилаю заявку виконавцям поруч.' },
  ]

  const TYPE_MS = 30

  // ВАЖЛИВО: тут лежить ПОВНИЙ текст репліки. Раніше сюди писався
  // порожній рядок, а chatRender різав саме його — тож відповіді Zunor
  // ніколи не з'являлись. Обрізає лише рендер, і тільки останню репліку.
  let chatShown = $state<ChatBeat[]>([])
  let typedChars = $state(0)
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
      await wait(300)

      for (const beat of CHAT_SCRIPT) {
        if (cancelled) return

        if (beat.role === 'user') {
          chatShown = [...chatShown, beat]
          await wait(500)
          continue
        }

        // Повний текст у стані; typedChars=0 ховає його до кінця паузи.
        chatShown = [...chatShown, beat]
        typedChars = 0
        await wait(reduceMotion ? 0 : 400)

        if (reduceMotion) {
          typedChars = beat.text.length
        } else {
          for (let c = 1; c <= beat.text.length; c++) {
            if (cancelled) return
            typedChars = c
            await wait(TYPE_MS)
          }
        }

        if (beat.chips) {
          await wait(200)
          chipsVisible = true
        }
        await wait(500)
      }
    }

    play()
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  })

  const chatRender = $derived(
    chatShown.map((b, i) => {
      const isLast = i === chatShown.length - 1
      if (b.role !== 'zunor' || !isLast) return { ...b, typing: false }
      return {
        ...b,
        text: b.text.slice(0, typedChars),
        typing: typedChars < b.text.length,
      }
    }),
  )

  const activeChips = $derived(
    chatShown.at(-1)?.role === 'zunor'
      ? (chatShown.at(-1) as { chips?: readonly string[] }).chips
      : undefined,
  )
</script>

<section
  aria-labelledby="how-it-works-heading"
  class="px-[clamp(20px,5vw,56px)] text-foreground"
>
  <div class="mx-auto max-w-[1120px]">
    <header class="mx-auto mb-[clamp(32px,4vw,52px)] max-w-[38rem] text-center">
      <p
        class="mt-3 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase"
      >
        Три кроки
      </p>
      <h2
        id="how-it-works-heading"
        class="text-[clamp(1.7rem,3.2vw,2.4rem)] leading-[1.08] font-semibold tracking-[-0.03em] text-balance"
      >
        Як це працює?
      </h2>
    </header>

    <!-- Панель ліворуч, опис праворуч. -->
    <div
      class="grid grid-cols-1 items-start gap-10 min-[960px]:grid-cols-[1.1fr_1fr] min-[960px]:gap-16"
      role="group"
      aria-label="Кроки замовлення"
    >
      <!-- ─── Панель ─── -->
      <div
        class="relative h-[340px] overflow-hidden rounded-2xl border border-border bg-card min-[960px]:h-[380px]"
      >
        {#key active}
          <div
            class="absolute inset-0 flex flex-col p-6 sm:p-7"
            in:fly={{
              y: 8,
              duration: T.panelIn,
              easing: cubicOut,
              delay: T.panelOut,
            }}
            out:fade={{ duration: T.panelOut }}
          >
            {#if active === 0}
              <p
                class="mb-4 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase"
              >
                Заявка
              </p>

              <div
                class="flex flex-1 flex-col justify-end gap-2 overflow-hidden"
              >
                {#each chatRender as m, i (i)}
                  {#if m.role === 'user'}
                    <div
                      class="max-w-[80%] self-end rounded-2xl rounded-br-sm bg-foreground px-3.5 py-2 text-[13.5px] leading-snug text-background"
                      in:fly={{ y: 6, duration: T.bubble, easing: cubicOut }}
                    >
                      {m.text}
                    </div>
                  {:else}
                    <div
                      class="max-w-[85%] self-start rounded-2xl rounded-bl-sm border border-border bg-background px-3.5 py-2 text-[13.5px] leading-snug whitespace-pre-line"
                      in:fly={{ y: 6, duration: T.bubble, easing: cubicOut }}
                    >
                      {m.text}{#if m.typing}<span class="caret">▍</span>{/if}
                    </div>
                  {/if}
                {/each}

                {#if chipsVisible && activeChips}
                  <div
                    class="mt-0.5 flex flex-wrap gap-1.5 self-start"
                    in:fade={{ duration: T.bubble }}
                  >
                    {#each activeChips as chip (chip)}
                      <span
                        class="rounded-full border border-border px-2.5 py-0.5 text-[12.5px] text-muted-foreground"
                      >
                        {chip}
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>
            {:else if active === 1}
              <div class="mb-4 flex items-baseline justify-between">
                <p
                  class="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase"
                >
                  Пропозиції
                </p>
                <span class="text-[12.5px] text-muted-foreground"
                  >3 виконавці</span
                >
              </div>

              <div class="flex flex-1 flex-col justify-center">
                <div
                  class="flex flex-col divide-y divide-border border-y border-border"
                >
                  {#each PROPOSALS as o, i (o.name)}
                    <div class="flex items-center gap-3.5 py-3.5">
                      <div
                        class="shrink-0"
                        out:send={{
                          key: i === CHOSEN_INDEX ? 'chosen' : `drop-${o.name}`,
                        }}
                      >
                        <span
                          class="flex size-9 items-center justify-center rounded-full border border-border bg-background text-[13px] font-medium"
                        >
                          {o.name[0]}
                        </span>
                      </div>

                      <div class="min-w-0 flex-1">
                        <p class="truncate text-[13.5px] font-medium">
                          {o.name}
                        </p>
                        <div
                          class="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground"
                        >
                          {#if o.rating}
                            <Star
                              size={11}
                              class="fill-current"
                              aria-hidden="true"
                            />
                            <span class="tabular-nums">{o.rating}</span>
                            <span aria-hidden="true">·</span>
                            <span class="tabular-nums"
                              >{o.reviews} відгуків</span
                            >
                          {:else}
                            <span>Новий виконавець</span>
                          {/if}
                        </div>
                      </div>

                      <div class="shrink-0 text-end">
                        <p class="text-[13.5px] font-medium tabular-nums">
                          {o.price}
                        </p>
                        <p class="mt-0.5 text-[12.5px] text-muted-foreground">
                          {o.note}
                        </p>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {:else}
              <p
                class="mb-4 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase"
              >
                Замовлення
              </p>

              <div
                class="flex flex-1 flex-col items-center justify-center text-center"
              >
                <div class="relative" in:receive={{ key: 'chosen' }}>
                  <span
                    class="flex size-14 items-center justify-center rounded-full bg-foreground text-lg font-medium text-background"
                  >
                    {chosen.name[0]}
                  </span>
                  <span
                    class="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full bg-card text-foreground ring-1 ring-border"
                  >
                    <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                  </span>
                </div>

                <p class="mt-4 text-[15px] font-medium">{chosen.name}</p>

                <div
                  class="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground"
                >
                  <Star size={12} class="fill-current" aria-hidden="true" />
                  <span class="tabular-nums">{chosen.rating}</span>
                  <span aria-hidden="true">·</span>
                  <span class="tabular-nums">{chosen.reviews} відгуків</span>
                </div>

                <div
                  class="mt-5 flex items-center gap-5 border-t border-border pt-5 text-[13.5px]"
                >
                  <span class="flex items-center gap-2 text-muted-foreground">
                    <Clock size={13} aria-hidden="true" />
                    {chosen.note}
                  </span>
                  <span class="font-medium tabular-nums">{chosen.price}</span>
                </div>
              </div>

              <p class="text-center text-[12.5px] text-muted-foreground">
                Контакти відкрито — далі спілкуєтесь напряму
              </p>
            {/if}
          </div>
        {/key}
      </div>

      <!-- ─── Опис праворуч ─── -->
      <ol class="flex flex-col">
        {#each STEPS as step, i (step.index)}
          <li class="relative">
            <!-- Волосяна рейка: активний крок заповнює її згори вниз. -->
            <span
              aria-hidden="true"
              class="absolute top-0 left-0 h-full w-px bg-border"
            ></span>
            <span
              aria-hidden="true"
              class="absolute top-0 left-0 h-full w-px origin-top bg-foreground transition-transform duration-100 ease-linear"
              style:transform="scaleY({active === i ? stepProgress : 0})"
            ></span>

            <button
              type="button"
              aria-pressed={active === i}
              onclick={() => (active = i)}
              class="w-full cursor-pointer py-5 pl-6 text-start transition-opacity duration-400 ease-out {active ===
              i
                ? 'opacity-100'
                : 'opacity-40 hover:opacity-70'}"
            >
              <span
                class="mb-1.5 block font-mono text-[11px] tracking-[0.14em] text-muted-foreground"
              >
                {step.index}
              </span>
              <h3
                class="text-[clamp(1.15rem,1.9vw,1.4rem)] leading-tight font-semibold tracking-[-0.02em]"
              >
                {step.title}
              </h3>
              <p
                class="mt-1.5 max-w-[36ch] text-[0.875rem] leading-relaxed text-muted-foreground"
              >
                {step.text}
              </p>
            </button>
          </li>
        {/each}
      </ol>
    </div>
  </div>
</section>

<style>
  .caret {
    display: inline-block;
    margin-left: 1px;
    animation: caret 1s steps(1) infinite;
  }

  @keyframes caret {
    0%,
    50% {
      opacity: 1;
    }
    50.01%,
    100% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .caret {
      animation: none;
      opacity: 1;
    }
  }
</style>
