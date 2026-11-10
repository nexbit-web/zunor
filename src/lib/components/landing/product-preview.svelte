<!--
  «Як це працює» — великий «скриншот» застосунку під першим екраном, як
  вікно продукту під заголовком у ClickUp. Але інтерфейс — НАШ, і він
  живий: у вікні по колу програється справжній шлях клієнта.

    1. «Нове замовлення»: у полі друкується задача, людина надсилає.
    2. Zunor «думає», питає площу, людина тисне кнопку-відповідь.
    3. Zunor збирає заявку (картка з деталями) — «Підтвердити заявку».
    4. «Готово!»: заявку опубліковано, шукаємо клінера поруч.
    5. Виїжджає сповіщення «Новий відгук», у панелі — бейдж.
    6. Сторінка заявки: пропозиції майстрів зʼявляються одна за одною.

  Усе, що можна, — справжні компоненти застосунку: шапка розмови
  (ChatHeader), «Думаю…» (ThinkingIndicator), відповідь Zunor
  (MessageBody), «Думав N с» (Marker), кроки «Готово!» (Trace),
  сповіщення (Island), стан заявки (JobState), рядки деталей
  (describeJob). Решта — розмітка, повторена з тих самих сторінок
  (jobs/new, jobs/[id]): там вона зшита з формою й запитами, і в
  картинку її не взяти. Змінили екран у застосунку — звір тут.

  Вікно — картинка, а не інтерфейс: `inert` вимикає посилання й фокус.
  Зверстане на 1080px і на вужчому екрані зменшується цілим (zoom).
  Сценарій грає, лише поки вікно видно; зі «зменшити рух» — одразу
  останній кадр.
-->
<script lang="ts">
  import { onMount } from 'svelte'
  import { fly, fade, scale } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import type { Toast } from 'svelte-hot-french-toast'
  import PanelLeft from '$lib/components/icons/set/panel-left.svelte'
  import Plus from '$lib/components/icons/set/plus.svelte'
  import Mic from '$lib/components/icons/set/mic.svelte'
  import ArrowUp from '$lib/components/icons/set/arrow-up.svelte'
  import Check from '$lib/components/icons/set/check.svelte'
  import Star from '$lib/components/icons/set/star.svelte'
  import Calendar from '$lib/components/icons/set/calendar.svelte'
  import MapPin from '$lib/components/icons/set/map-pin.svelte'
  import Eye from '$lib/components/icons/set/eye.svelte'
  import Home from '$lib/components/icons/set/house.svelte'
  import Sofa from '$lib/components/icons/set/sofa.svelte'
  import Sparkles from '$lib/components/icons/set/sparkles.svelte'
  import AppWindow from '$lib/components/icons/set/app-window.svelte'
  import Building from '$lib/components/icons/set/building.svelte'
  import DoorOpen from '$lib/components/icons/set/door-open.svelte'
  import Trash2 from '$lib/components/icons/set/trash-2.svelte'
  import Ruler from '$lib/components/icons/set/ruler.svelte'
  import ClipboardCheck from '$lib/components/icons/set/clipboard-check.svelte'
  import MessageSquareText from '$lib/components/icons/set/message-square-text.svelte'
  import ZunorMark from '$lib/components/icons/zunor-mark.svelte'
  import {
    NewJobIcon,
    JobsIcon,
    OrdersIcon,
    MessagesIcon,
    NotificationsIcon,
    SettingsIcon,
  } from '$lib/components/icons'
  import ChatHeader from '$lib/components/zunor/chat-header.svelte'
  import ThinkingIndicator from '$lib/components/zunor/thinking-indicator.svelte'
  import MessageBody from '$lib/components/zunor/MessageBody.svelte'
  import * as Marker from '$lib/components/ui/marker'
  import * as Trace from '$lib/components/ui/trace'
  import { Spinner } from '$lib/components/ui/spinner'
  import { Button } from '$lib/components/ui/button'
  import {
    Avatar,
    AvatarFallback,
  } from '$lib/components/ui/avatar'
  import Island from '$lib/notifications/island.svelte'
  import JobState from '$lib/components/jobs/job-state.svelte'
  import ServiceIcon from '$lib/categories/cleaning/service-icon.svelte'
  import { describeJob } from '$lib/categories/cleaning/describe'
  import { resolveWhen } from '$lib/categories/cleaning/presets'
  import { formatDay } from '$lib/utils/time'

  const WIDTH = 1080
  let frameWidth = $state(WIDTH)
  const zoom = $derived(Math.min(1, frameWidth / WIDTH))

  // ─── Зміст сценарію ───

  const TASK = 'Треба прибрати квартиру після ремонту, завтра зранку'
  const ASK = 'Зрозуміло! А яка приблизно площа квартири?'
  const AREA_CHIPS = ['до 50 м²', '50–80 м²', 'понад 80 м²']

  // Ті самі підказки, що на першому екрані /dashboard/jobs/new.
  const HERO_CHIPS = [
    { label: 'Прибрати квартиру', icon: Home },
    { label: 'Хімчистка', icon: Sofa },
    { label: 'Генеральне прибирання', icon: Sparkles },
    { label: 'Помити вікна', icon: AppWindow },
  ]

  const DRAFT = {
    title: 'Прибирання квартири після ремонту',
    description:
      'Двокімнатна квартира після ремонту: пил, кухня, санвузол і вікна.',
    metadata: {
      premise: 'apartment',
      service: 'post-renovation',
      rooms: '2',
      areaM2: 65,
      trash: 'needs-removal',
      when: 'tomorrow',
    },
  }
  // Рядки картки — тим самим describeJob, що й справжня картка драфту.
  // Чотири з шести: повна картка у вікні 600px виштовхувала назву за
  // верхній край.
  const createdAt = new Date().toISOString()
  const SHOWN_ROWS = ['Послуга', 'Площа', 'Сміття', 'Коли']
  const draftRows = describeJob(DRAFT.metadata, createdAt).filter((r) =>
    SHOWN_ROWS.includes(r.label),
  )
  // День — як у JobSummary: resolveWhen + formatDay.
  const day = formatDay(resolveWhen(DRAFT.metadata.when, createdAt) ?? createdAt)
  const ROW_ICONS: Record<string, typeof ClipboardCheck> = {
    Home,
    Building,
    Sparkles,
    DoorOpen,
    Trash2,
    Ruler,
    Calendar,
  }

  const PROPOSALS = [
    {
      name: 'Оля Петренко',
      initials: 'ОП',
      recommended: true,
      isNew: false,
      rating: 4.9,
      reviews: 27,
      price: '1 600 ₴',
      days: '1 день',
      message:
        'Можу завтра о 9:00. Засоби й пилосос мої, після ремонту приберу пил навіть з плінтусів і ламп.',
    },
    {
      name: 'Ірина Коваль',
      initials: 'ІК',
      recommended: true,
      isNew: true,
      rating: 0,
      reviews: 0,
      price: '1 450 ₴',
      days: '1 день',
      message: 'Добрий день! Вільна завтра з 10:00, маю професійний пилосос.',
    },
    {
      name: 'Клін Про',
      initials: 'КП',
      recommended: false,
      isNew: false,
      rating: 4.8,
      reviews: 112,
      price: '1 900 ₴',
      days: '1 день',
      message: 'Приїдемо вдвох і вивеземо будівельне сміття.',
    },
  ]

  const chip =
    'inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium whitespace-nowrap'

  // ─── Стан сценарію ───

  type Scene = 'hero' | 'chat' | 'done' | 'job'
  type Msg =
    | { id: number; role: 'user'; text: string }
    | {
        id: number
        role: 'zunor'
        text: string
        shown: number
        typing: boolean
        think: number
      }
    | { id: number; role: 'summary' }

  let scene = $state<Scene>('hero')
  let typed = $state('')
  let messages = $state<Msg[]>([])
  let thinking = $state(false)
  let chips = $state<string[]>([])
  /** Що саме зараз «натиснули»: кнопка надсилання, чіпс чи «Підтвердити». */
  let pressed = $state<string | null>(null)
  let island = $state<'off' | 'on' | 'leaving'>('off')
  let proposals = $state(0)
  let notif = $state(0)

  const NAV = $derived([
    { icon: NewJobIcon, label: 'Нове замовлення', active: scene !== 'job' },
    { icon: JobsIcon, label: 'Мої заявки', active: scene === 'job' },
    { icon: OrdersIcon, label: 'Замовлення' },
    { icon: MessagesIcon, label: 'Повідомлення' },
    { icon: NotificationsIcon, label: 'Сповіщення', badge: notif, alert: true },
  ])

  function reset() {
    scene = 'hero'
    typed = ''
    messages = []
    thinking = false
    chips = []
    pressed = null
    island = 'off'
    proposals = 0
    notif = 0
  }

  /** Останній кадр — для «зменшити рух»: результат без руху. */
  function finalFrame() {
    scene = 'job'
    proposals = PROPOSALS.length
    notif = 1
  }

  class Stop extends Error {}

  let root = $state<HTMLElement | null>(null)

  onMount(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finalFrame()
      return
    }

    let alive = true
    let visible = false
    let wake: (() => void) | null = null

    // Пауза, яка стоїть, доки вікно поза екраном: сценарій не біжить
    // даремно й не починається з середини, коли до нього докрутили.
    async function sleep(ms: number) {
      let left = ms
      while (left > 0) {
        if (!alive) throw new Stop()
        if (!visible) {
          await new Promise<void>((r) => (wake = r))
          wake = null
          continue
        }
        const step = Math.min(left, 80)
        await new Promise((r) => setTimeout(r, step))
        left -= step
      }
      if (!alive) throw new Stop()
    }

    async function say(id: number, text: string, think: number) {
      messages.push({ id, role: 'zunor', text, shown: 0, typing: true, think })
      const m = messages[messages.length - 1] as Extract<Msg, { role: 'zunor' }>
      for (let i = 1; i <= text.length; i++) {
        m.shown = i
        await sleep(20)
      }
      m.typing = false
    }

    async function play() {
      reset()
      await sleep(1000)

      // 1. Людина пише задачу й надсилає
      for (const ch of TASK) {
        typed += ch
        await sleep(36)
      }
      await sleep(500)
      pressed = 'send'
      await sleep(200)
      pressed = null

      // 2. Zunor думає й уточнює площу
      scene = 'chat'
      messages = [{ id: 1, role: 'user', text: typed }]
      typed = ''
      await sleep(350)
      thinking = true
      await sleep(1900)
      thinking = false
      await say(2, ASK, 2)
      await sleep(200)
      chips = AREA_CHIPS
      await sleep(1300)
      pressed = AREA_CHIPS[1]
      await sleep(380)
      pressed = null
      chips = []
      messages.push({ id: 3, role: 'user', text: AREA_CHIPS[1] })

      // 3. Заявка зібрана — підтвердити
      await sleep(350)
      thinking = true
      await sleep(2000)
      thinking = false
      messages.push({ id: 4, role: 'summary' })
      await sleep(2200)
      pressed = 'confirm'
      await sleep(450)
      pressed = null

      // 4. Готово — шукаємо клінера
      scene = 'done'
      await sleep(2400)

      // 5. Перший відгук
      island = 'on'
      notif = 1
      await sleep(2800)

      // 6. Сторінка заявки з пропозиціями
      scene = 'job'
      for (let i = 1; i <= PROPOSALS.length; i++) {
        await sleep(600)
        proposals = i
      }
      await sleep(900)
      island = 'leaving'
      await sleep(4200)
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        if (visible) wake?.()
      },
      { threshold: 0.3 },
    )
    if (root) io.observe(root)

    ;(async () => {
      try {
        while (alive) await play()
      } catch (e) {
        if (!(e instanceof Stop)) throw e
      }
    })()

    return () => {
      alive = false
      io.disconnect()
      wake?.()
    }
  })
</script>

{#snippet composer()}
  <!-- Поле вводу — як job-input-shell на /dashboard/jobs/new -->
  <div class="flex flex-col rounded-full border border-border bg-card">
    <div class="flex items-center gap-1 px-2 py-2">
      <span class="flex size-8 shrink-0 items-center justify-center rounded-full">
        <Plus size={21} strokeWidth={2} />
      </span>
      <span
        class="min-w-0 flex-1 truncate px-0.5 py-1 text-[16px] leading-relaxed"
      >
        {#if typed}
          {typed}<span class="caret"></span>
        {:else}
          <span class="text-muted-foreground">
            {scene === 'hero' ? 'Треба прибрати квартиру...' : 'Відповісти Zunor'}
          </span>
        {/if}
      </span>
      <span class="flex items-center gap-2">
        <span class="flex size-8 shrink-0 items-center justify-center rounded-full">
          <Mic size={20} strokeWidth={2} />
        </span>
        {#if typed}
          <span
            in:scale={{ duration: 140, start: 0.8, easing: quintOut }}
            class={[
              'flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-transform duration-150',
              pressed === 'send' && 'scale-90',
            ]}
          >
            <ArrowUp size={18} />
          </span>
        {/if}
      </span>
    </div>
  </div>
{/snippet}

<section id="how" aria-label="Як це працює" class="scroll-mt-20 px-5 pb-24">
  <div
    bind:this={root}
    class="relative mx-auto max-w-[1080px]"
    bind:clientWidth={frameWidth}
    aria-hidden="true"
  >
    <div class="w-[1080px] select-none" style="zoom: {zoom}" inert>
      <div
        class="flex h-[600px] overflow-hidden rounded-[16px] border border-border bg-background shadow-[0_24px_60px_-28px_rgb(15_23_42/0.28)]"
      >
        <!-- Бокова панель — розгорнута, на тон сіріша за сторінку -->
        <aside
          class="flex w-[248px] shrink-0 flex-col bg-(--sidebar-raised) p-1.5 text-sidebar-foreground"
        >
          <div class="flex h-9 items-center justify-between px-1 pt-0.5">
            <span class="flex items-center gap-2 p-1 pe-2">
              <ZunorMark class="size-6" />
              <span class="text-[19px] font-semibold tracking-[-0.02em]">
                Zunor
              </span>
            </span>
            <span class="flex size-8 items-center justify-center">
              <PanelLeft size={22} strokeWidth={1.75} />
            </span>
          </div>

          <ul class="mt-2 flex flex-col gap-1 px-1">
            {#each NAV as item (item.label)}
              <li
                class={[
                  'flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors duration-300',
                  item.active
                    ? 'bg-[color-mix(in_srgb,var(--sidebar-foreground)_9%,transparent)] font-medium'
                    : '',
                ]}
              >
                <item.icon size={20} strokeWidth={1.75} />
                <span class="flex-1">{item.label}</span>
                {#if item.badge}
                  <span
                    in:scale={{ duration: 220, start: 0.5, easing: quintOut }}
                    class={[
                      'flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium',
                      item.alert
                        ? 'bg-destructive text-white'
                        : 'bg-primary text-primary-foreground',
                    ]}
                  >
                    {item.badge}
                  </span>
                {/if}
              </li>
            {/each}
          </ul>

          <div class="mt-auto flex flex-col gap-1 px-1 pb-1">
            <span class="flex h-9 items-center gap-2 rounded-md px-2 text-sm">
              <SettingsIcon size={20} strokeWidth={1.75} />
              Налаштування
            </span>
            <span class="flex h-12 items-center gap-2 rounded-md px-2">
              <span
                class="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-rose-300 to-pink-600 text-xs font-semibold text-white"
              >
                О
              </span>
              <span class="grid text-sm leading-tight">
                <span class="font-medium">Олена Коваль</span>
                <span class="text-xs text-muted-foreground">olena@gmail.com</span>
              </span>
            </span>
          </div>
        </aside>

        <!-- Сторінка -->
        <div class="relative min-w-0 flex-1 overflow-hidden">
          {#if scene === 'hero' || scene === 'chat'}
            <ChatHeader
              city="Одеса"
              started={scene === 'chat'}
              onreset={() => {}}
              oncopy={() => {}}
            />
          {/if}

          {#if scene === 'hero'}
            <!-- ─── Перший екран «Нове замовлення» ─── -->
            <div
              class="flex h-full flex-col items-center justify-center px-4"
              in:fade={{ duration: 250 }}
            >
              <h3
                class="mb-6 flex items-center justify-center text-[38px] leading-[1.25] font-medium tracking-[-0.02em]"
              >
                <span
                  class="me-[0.3em] inline-flex size-[0.78em] shrink-0 items-center justify-center"
                >
                  <ZunorMark class="size-full" />
                </span>
                Що потрібно прибрати?
              </h3>
              <div class="flex w-full max-w-[40rem] flex-col gap-3">
                {@render composer()}
                <div class="flex flex-wrap justify-center gap-2">
                  {#each HERO_CHIPS as c (c.label)}
                    <span class="suggestion-chip">
                      <c.icon size={15} />
                      {c.label}
                    </span>
                  {/each}
                </div>
                <span class="mt-1 text-center text-[12.5px] text-muted-foreground">
                  Заповнити форму вручну
                </span>
              </div>
            </div>
          {:else if scene === 'chat'}
            <!-- ─── Розмова ─── -->
            <div class="flex h-full flex-col" in:fade={{ duration: 200 }}>
              <!-- justify-end: нове повідомлення внизу, старі їдуть угору й
                   ховаються за верхнім краєм — як прокрутка в чаті. -->
              <div class="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
                <div class="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 pt-11 pb-6">
                  {#each messages as m (m.id)}
                    {#if m.role === 'user'}
                      <div
                        class="flex justify-end"
                        in:fly={{ y: 6, duration: 280, easing: quintOut }}
                      >
                        <div
                          class="w-fit max-w-[75%] rounded-3xl rounded-br-md bg-primary px-4 py-3 text-[16px] leading-5.5 text-primary-foreground"
                        >
                          {m.text}
                        </div>
                      </div>
                    {:else if m.role === 'zunor'}
                      <div in:fade={{ duration: 220 }}>
                        <Marker.Root class="mb-2 text-[13px]">
                          <Marker.Content>Думав {m.think} с</Marker.Content>
                        </Marker.Root>
                        <MessageBody
                          text={m.text.slice(0, m.shown)}
                          typing={m.typing}
                        />
                      </div>
                    {:else}
                      <!-- Картка зібраної заявки — як summary на jobs/new -->
                      <div in:fly={{ y: 8, duration: 380, easing: quintOut }}>
                        <p
                          class="mb-1 px-1 text-[20px] font-bold tracking-[-0.02em] text-foreground"
                        >
                          {DRAFT.title}
                        </p>
                        <p
                          class="mb-5 px-1 text-[13.5px] leading-relaxed text-muted-foreground"
                        >
                          {DRAFT.description}
                        </p>
                        <div
                          class="mb-3 overflow-hidden rounded-[18px] bg-card shadow-[0_1px_2px_rgba(20,24,40,0.04)]"
                        >
                          {#each draftRows as row, ri (row.label)}
                            {@const RowIcon = ROW_ICONS[row.icon ?? ''] ?? ClipboardCheck}
                            <div
                              class={[
                                'flex items-center gap-3 px-4 py-3',
                                ri > 0 && 'border-t border-border/60',
                              ]}
                            >
                              <span
                                class="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                              >
                                <RowIcon size={14} />
                              </span>
                              <span class="flex-1 text-[14.5px] text-foreground">
                                {row.label}
                              </span>
                              <span class="text-[14.5px] text-muted-foreground">
                                {row.value}
                              </span>
                            </div>
                          {/each}
                        </div>
                        <span
                          class={[
                            'mt-1.5 inline-flex h-13.5 w-full items-center justify-center rounded-[16px] bg-primary text-[15.5px] font-semibold tracking-[-0.01em] text-primary-foreground transition-transform duration-150',
                            pressed === 'confirm' && 'scale-[0.98]',
                          ]}
                        >
                          Підтвердити заявку
                        </span>
                      </div>
                    {/if}
                  {/each}

                  {#if thinking}
                    <div in:fade={{ duration: 200 }}>
                      <ThinkingIndicator />
                    </div>
                  {/if}
                </div>
              </div>

              <!-- Поле вводу внизу, над ним — кнопки-відповіді -->
              <div class="px-4 pb-2">
                <div class="mx-auto flex w-full max-w-3xl flex-col">
                  {#if chips.length}
                    <div class="flex flex-wrap gap-2 pb-2.5">
                      {#each chips as c, i (c)}
                        <span
                          class={['suggestion-chip', pressed === c && 'pressed']}
                          in:fly={{ y: 8, duration: 450, delay: 120 + i * 60, easing: quintOut }}
                        >
                          {c}
                        </span>
                      {/each}
                    </div>
                  {/if}
                  {@render composer()}
                  <p
                    class="pt-2 text-center text-[12px] leading-4 text-muted-foreground"
                  >
                    Zunor — це AI, і він може помилятися. Перевіряй деталі заявки.
                  </p>
                </div>
              </div>
            </div>
          {:else if scene === 'done'}
            <!-- ─── «Готово!» — як після підтвердження на jobs/new ─── -->
            <div
              class="flex h-full flex-col items-center justify-center gap-2 px-8 text-center"
              in:scale={{ duration: 400, start: 0.85, easing: quintOut }}
            >
              <span
                class="mb-4 flex size-16 items-center justify-center rounded-lg bg-primary text-primary-foreground"
              >
                <Check size={28} />
              </span>
              <p class="text-[22px] font-bold tracking-[-0.03em] text-foreground">
                Готово!
              </p>
              <Trace.Root class="mt-3 w-fit gap-2.5 text-left">
                <div in:fly={{ y: 4, duration: 260, delay: 150, easing: quintOut }}>
                  <Trace.Line class="text-[14.5px]">
                    <Trace.Icon class="text-primary"><Check /></Trace.Icon>
                    <Trace.Title>Заявку опубліковано</Trace.Title>
                  </Trace.Line>
                </div>
                <div in:fly={{ y: 4, duration: 260, delay: 450, easing: quintOut }}>
                  <Trace.Line status="running" class="text-[14.5px]">
                    <Trace.Icon><Spinner class="size-4" /></Trace.Icon>
                    <Trace.Title>Шукаю тобі клінера поруч</Trace.Title>
                  </Trace.Line>
                </div>
              </Trace.Root>
            </div>
          {:else}
            <!-- ─── Сторінка заявки з пропозиціями (jobs/[id]) ─── -->
            <div class="h-full overflow-hidden" in:fade={{ duration: 250 }}>
              <div class="mx-auto w-full max-w-3xl px-6 pt-9">
                <header class="flex items-start gap-4">
                  <span
                    class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/80"
                  >
                    <ServiceIcon service="post-renovation" class="size-8" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-[13px] text-muted-foreground">Після ремонту</p>
                    <p
                      class="mt-0.5 text-[28px] leading-tight font-semibold tracking-tight text-foreground"
                    >
                      {DRAFT.title}
                    </p>
                  </div>
                </header>
                <div
                  class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground"
                >
                  <JobState status="OPEN" proposalsCount={proposals} />
                  <span class="inline-flex items-center gap-1.5">
                    <Calendar class="size-3.5" />
                    <span class="text-foreground/80">{day}</span>
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                    <MapPin class="size-3.5" />
                    Одеса · Таїрова
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                    <Eye class="size-3.5" />
                    {12 + proposals * 3} переглядів
                  </span>
                </div>

                <section class="mt-8">
                  <div class="flex items-baseline justify-between gap-3">
                    <p class="text-lg font-semibold tracking-tight">
                      Рекомендуємо для вас
                    </p>
                    <span class="text-sm text-muted-foreground tabular-nums">
                      {proposals}
                    </span>
                  </div>
                  <p class="mt-1 text-[13px] text-muted-foreground">
                    Порівняйте ціну, відгуки й повідомлення — і оберіть одного
                    майстра.
                  </p>

                  <ul class="mt-3 border-t border-border/60">
                    {#each PROPOSALS.slice(0, proposals) as p (p.name)}
                      <li
                        class="border-b border-border/60 py-4"
                        in:fly={{ y: 10, duration: 380, easing: quintOut }}
                      >
                        <div class="flex items-start gap-3">
                          <div class="flex min-w-0 flex-1 items-start gap-3">
                            <Avatar class="size-10 shrink-0">
                              <AvatarFallback
                                class="bg-muted text-sm font-semibold text-muted-foreground"
                              >
                                {p.initials}
                              </AvatarFallback>
                            </Avatar>
                            <span class="min-w-0">
                              <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span class="text-[15px] font-medium text-foreground">
                                  {p.name}
                                </span>
                                {#if p.recommended}
                                  <span class="{chip} bg-primary/10 text-primary">
                                    <Star class="size-3 fill-current" />
                                    Рекомендуємо
                                  </span>
                                {/if}
                                {#if p.isNew}
                                  <span class="{chip} bg-muted text-foreground/80">
                                    Новачок
                                  </span>
                                {/if}
                              </span>
                              <span
                                class="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground"
                              >
                                {#if p.reviews > 0}
                                  <Star class="size-3 shrink-0 fill-amber-400 text-amber-400" />
                                  <span class="font-medium text-foreground/80">
                                    {p.rating.toFixed(1)}
                                  </span>
                                  <span>({p.reviews})</span>
                                  <span>·</span>
                                {/if}
                                <span>щойно</span>
                              </span>
                            </span>
                          </div>
                          <div class="shrink-0 text-right">
                            <p class="text-base font-semibold text-foreground tabular-nums">
                              {p.price}
                            </p>
                            <p class="mt-0.5 text-[12.5px] text-muted-foreground">
                              {p.days}
                            </p>
                          </div>
                        </div>
                        <p
                          class="mt-3 pl-13 text-[14.5px] leading-relaxed text-pretty text-foreground"
                        >
                          {p.message}
                        </p>
                        <div class="mt-3 pl-13">
                          <Button variant="primary">
                            <Check /> Обрати майстра
                          </Button>
                        </div>
                      </li>
                    {/each}
                  </ul>
                </section>
              </div>
            </div>
          {/if}

          <!-- Сповіщення — справжня картка, виїжджає з-за правого краю -->
          {#if island !== 'off'}
            <div class="absolute top-4 right-4 z-30 w-[380px]">
              <Island
                toast={{ id: 'preview', visible: island === 'on' } as unknown as Toast}
                label="Новий відгук"
                title="Майстер відгукнувся на твою заявку!"
                body={DRAFT.title}
                action="Переглянути відгук"
                href="/dashboard/jobs"
                icon={MessageSquareText}
                tone="accent"
                duration={6000}
              />
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Низ вікна тане в сторінку -->
    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 h-[22%] bg-linear-to-t from-background to-transparent"
    ></div>
  </div>
</section>

<style>
  /* Пігулка підказок і швидких відповідей — як .suggestion-chip на
     jobs/new. */
  .suggestion-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border: 1px solid var(--border);
    border-radius: 9999px;
    background: var(--background);
    padding: 0.4rem 0.9rem;
    font-size: 13.5px;
    font-weight: 500;
    color: var(--foreground);
    transition:
      border-color 200ms ease,
      background-color 200ms ease,
      transform 150ms ease;
  }
  .suggestion-chip :global(svg) {
    color: var(--muted-foreground);
  }
  /* «Натиснули» — ховер і стиск, як під справжнім пальцем. */
  .suggestion-chip.pressed {
    border-color: color-mix(in srgb, var(--foreground) 22%, var(--border));
    background: var(--accent);
    transform: scale(0.97);
  }

  /* Каретка, що блимає за надрукованим текстом. */
  .caret {
    display: inline-block;
    width: 1.5px;
    height: 1.05em;
    margin-left: 1px;
    vertical-align: -0.15em;
    background: var(--primary);
    animation: caret 1s steps(1) infinite;
  }
  @keyframes caret {
    50% {
      opacity: 0;
    }
  }
</style>
