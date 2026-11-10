<!--
  Заявка без чату: пʼять кроків (що, яке прибирання, деталі, коли, фото й
  опис). Той самий майстер і для РЕДАГУВАННЯ заявки (проп `edit`):
  відкривається одразу на останньому кроці зі зведенням, де кожен пункт
  веде на свій крок, а після кроку — назад до зведення. Одна форма на
  створення й правку: поля й перевірки не розійдуться.
-->
<script lang="ts" module>
  /** Заявка, яку редагуємо. Без пропа — створення нової. */
  export interface JobEditData {
    id: string
    metadata: Record<string, unknown> | null
    description: string | null
    attachments: string[]
    attachmentsPublicIds: string[]
    createdAt: string
    /** Скільки майстрів уже надіслали пропозицію — їх сповістимо. */
    proposals: number
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { goto } from '$app/navigation'
  import toast from 'svelte-hot-french-toast'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Spinner } from '$lib/components/ui/spinner'
  import { Calendar } from '$lib/components/ui/calendar'
  import PortfolioUploader from '$lib/components/portfolio-uploader.svelte'
  import SuccessCheck from '$lib/components/success-check.svelte'
  import DuplicateNotice from '$lib/components/jobs/duplicate-notice.svelte'
  import type { DuplicateJob } from '$lib/types/jobs'
  import {
    PREMISES,
    SERVICES,
    ROOM_OPTIONS,
    ELEVATOR_OPTIONS,
    BALCONY_OPTIONS,
    WINDOW_SIDE_OPTIONS,
    TRASH_OPTIONS,
    FREQUENCY_OPTIONS,
    SOFA_ITEMS,
    QUICK_WHEN,
    needsRooms,
    needsWindows,
    needsItems,
    needsFrequency,
    needsTrash,
    resolveWhen,
  } from '$lib/categories/cleaning/presets'
  import { describeJob } from '$lib/categories/cleaning/describe'
  import { formatDay } from '$lib/utils/time'
  import ChevronRight from '$lib/components/icons/set/chevron-right.svelte'
  import { generateTitle } from '$lib/categories/cleaning/title-gen'
  import type { CleaningItem } from '$lib/categories/cleaning/title-gen'
  import ArrowLeft from '$lib/components/icons/set/arrow-left.svelte'
  import Check from '$lib/components/icons/set/check.svelte'
  import Plus from '$lib/components/icons/set/plus.svelte'
  import Minus from '$lib/components/icons/set/minus.svelte'
  import Square from '$lib/components/icons/set/square.svelte'
  import Building2 from '$lib/components/icons/set/building-2.svelte'
  import Home from '$lib/components/icons/set/house.svelte'
  import Briefcase from '$lib/components/icons/set/briefcase.svelte'
  import Store from '$lib/components/icons/set/store.svelte'
  import Boxes from '$lib/components/icons/set/boxes.svelte'
  import Sparkle from '$lib/components/icons/set/sparkle.svelte'
  import Sparkles from '$lib/components/icons/set/sparkles.svelte'
  import Hammer from '$lib/components/icons/set/hammer.svelte'
  import GlassWater from '$lib/components/icons/set/glass-water.svelte'
  import Sofa from '$lib/components/icons/set/sofa.svelte'
  import Repeat from '$lib/components/icons/set/repeat.svelte'
  import {
    getLocalTimeZone,
    parseDate,
    today,
    type DateValue,
  } from '@internationalized/date'
  import { fly, scale } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import { playSuccessSound, unlockAudio } from '$lib/sound/notification'

  const stepIn = { y: 12, duration: 280, easing: quintOut }
  const REDIRECT_DELAY = 2200

  const ICONS: Record<string, typeof Square> = {
    Building2,
    Home,
    Briefcase,
    Store,
    Boxes,
    Sparkle,
    Sparkles,
    Hammer,
    GlassWater,
    Sofa,
    Repeat,
  }
  function iconByName(name: string): typeof Square {
    return ICONS[name] ?? Square
  }

  let { edit }: { edit?: JobEditData } = $props()

  // Початковий знімок заявки — далі форма живе сама (AGENTS, розділ 8).
  const start = untrack(() => edit)
  const m = (start?.metadata ?? {}) as Record<string, unknown>
  const str = (v: unknown): string =>
    typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''

  // «Сьогодні/завтра» в заявці — від дня її створення; у формі показуємо
  // датою. Дата, що вже минула, — не вибір: людина обере нову.
  const todayDate = today(getLocalTimeZone())
  const startWhen = (() => {
    if (!start) return ''
    const iso = resolveWhen(m.when, start.createdAt)
    return iso && iso >= todayDate.toString() ? iso : ''
  })()

  // ─── State ───
  let step = $state(start ? (startWhen ? 5 : 4) : 1)
  let premise = $state(str(m.premise))
  let service = $state(str(m.service))

  let rooms = $state(str(m.rooms))
  let floor = $state(str(m.floor))
  let hasElevator = $state(str(m.hasElevator))
  let trash = $state(str(m.trash))
  let frequency = $state(str(m.frequency))
  let windowsCount = $state(str(m.windowsCount))
  let windowSide = $state(str(m.windowSide))
  let balcony = $state(str(m.balcony))
  let items = $state<CleaningItem[]>(
    Array.isArray(m.items)
      ? (m.items as CleaningItem[]).map((i) => ({ ...i }))
      : [],
  )

  let when = $state(startWhen)
  let calendarValue = $state<DateValue | undefined>(
    startWhen ? parseDate(startWhen) : undefined,
  )

  let note = $state(start?.description ?? '')
  let imageUrls = $state<string[]>(start ? [...start.attachments] : [])
  let imagePublicIds = $state<string[]>(
    start ? [...start.attachmentsPublicIds] : [],
  )
  let uploading = $state(false)

  let submitting = $state(false)
  let success = $state(false)
  let serverError = $state('')

  // Схожа відкрита заявка (409 від POST /api/jobs) — разом із послугою, на
  // яку її знайшли: обрала людина іншу — попередження вже не про цю.
  let duplicate = $state<{ job: DuplicateJob; service: string } | null>(null)
  const shownDuplicate = $derived(
    duplicate && duplicate.service === service ? duplicate.job : null,
  )

  // Крок 3 адаптивний: набір обовʼязкових полів залежить від послуги.
  const step3Valid = $derived.by(() => {
    if (needsItems(service)) return items.length > 0
    if (needsWindows(service))
      return (
        windowsCount !== '' && Number(windowsCount) > 0 && windowSide !== ''
      )
    if (needsRooms(service)) {
      const base = rooms !== ''
      if (needsFrequency(service)) return base && frequency !== ''
      return base
    }
    return true
  })

  const previewMeta = $derived({
    premise,
    service,
    when,
    rooms: rooms || undefined,
    floor: floor ? Number(floor) : undefined,
    hasElevator: hasElevator || undefined,
    trash: trash || undefined,
    frequency: frequency || undefined,
    windowsCount: windowsCount ? Number(windowsCount) : undefined,
    windowSide: windowSide || undefined,
    balcony: balcony || undefined,
    items: items.length ? items : undefined,
    // Площа від асистента: форма її не питає, сервер зберігає сам. Лише
    // поки послуга та сама — для іншої вона може не мати сенсу.
    areaM2:
      service === m.service && typeof m.areaM2 === 'number'
        ? m.areaM2
        : undefined,
  })
  const previewTitle = $derived(
    premise && service ? generateTitle(previewMeta) : '',
  )

  // ─── Хімчистка: лічильник предметів ───
  function itemQty(type: string, variant?: string): number {
    return (
      items.find(
        (i) => i.type === type && (i.variant ?? '') === (variant ?? ''),
      )?.qty ?? 0
    )
  }
  function addItem(type: string, variant?: string) {
    const idx = items.findIndex(
      (i) => i.type === type && (i.variant ?? '') === (variant ?? ''),
    )
    if (idx >= 0) {
      items[idx].qty++
      items = [...items]
    } else {
      items = [...items, { type, qty: 1, ...(variant ? { variant } : {}) }]
    }
  }
  function removeItem(type: string, variant?: string) {
    const idx = items.findIndex(
      (i) => i.type === type && (i.variant ?? '') === (variant ?? ''),
    )
    if (idx < 0) return
    if (items[idx].qty > 1) {
      items[idx].qty--
      items = [...items]
    } else {
      items = items.filter((_, i) => i !== idx)
    }
  }

  // ─── Навігація ───
  // У редагуванні після кроку — назад до зведення, якщо далі нічого
  // обовʼязкового не лишилось.
  const ready = $derived(!!premise && !!service && step3Valid && !!when)

  function selectPremise(key: string) {
    unlockAudio() // розблокування звуку на перший жест (autoplay policy)
    premise = key
    step = edit && ready ? 5 : 2
  }
  function selectService(key: string) {
    // Та сама послуга в редагуванні — деталі лишаються як були.
    if (edit && key === service) {
      step = ready ? 5 : 3
      return
    }
    service = key
    rooms = ''
    floor = ''
    hasElevator = ''
    trash = ''
    frequency = ''
    windowsCount = ''
    windowSide = ''
    balcony = ''
    items = []
    step = 3
  }
  function goToWhen() {
    if (step3Valid) step = edit && when ? 5 : 4
  }
  function selectQuickWhen(key: string) {
    // У редагуванні — датою: «завтра» в заявці рахувалось би від дня її
    // створення (сервер так само переведе, тут — щоб показати дату).
    if (edit) {
      when = resolveWhen(key, new Date()) ?? key
      calendarValue = parseDate(when)
    } else {
      when = key
      calendarValue = undefined
    }
    step = 5
  }
  function onCalendarPick(v: DateValue | undefined) {
    if (v) {
      when = v.toString()
      step = 5
    }
  }
  function back() {
    if (edit) {
      step = ready ? 5 : Math.max(1, step - 1)
      return
    }
    if (step > 1) step--
  }

  // ─── Зведення для редагування ───
  const premiseLabel = $derived(
    PREMISES.find((p) => p.key === premise)?.label ?? '',
  )
  const serviceLabel = $derived(
    SERVICES.find((x) => x.key === service)?.label ?? '',
  )
  const detailsLabel = $derived(
    describeJob(previewMeta)
      .filter((d) => !['Помешкання', 'Послуга', 'Коли'].includes(d.label))
      .flatMap((d) =>
        d.items
          ? d.items.map((i) => (i.qty > 1 ? `${i.name} × ${i.qty}` : i.name))
          : [d.value],
      )
      .filter(Boolean)
      .join(' · '),
  )
  const whenLabel = $derived(
    /^\d{4}-\d{2}-\d{2}$/.test(when) ? formatDay(when) : '',
  )


  // confetti вантажимо лениво — не тягнемо в початковий бандл.
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
      setTimeout(() => {
        confetti({
          particleCount: 40,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors,
          disableForReducedMotion: true,
        })
        confetti({
          particleCount: 40,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors,
          disableForReducedMotion: true,
        })
      }, 150)
    } catch {
      // confetti не критичний — мовчки ігноруємо
    }
  }

  async function submit() {
    if (submitting || success) return
    submitting = true
    serverError = ''

    // Збираємо лише релевантні для послуги поля (сервер валідує повторно).
    const metadata: Record<string, unknown> = { premise, service, when }
    if (needsRooms(service)) {
      metadata.rooms = rooms
      if (floor) metadata.floor = Number(floor)
      if (hasElevator) metadata.hasElevator = hasElevator
    }
    if (needsTrash(service) && trash) metadata.trash = trash
    if (needsFrequency(service)) metadata.frequency = frequency
    if (needsWindows(service)) {
      metadata.windowsCount = Number(windowsCount)
      metadata.windowSide = windowSide
      if (floor) metadata.floor = Number(floor)
      if (balcony) metadata.balcony = balcony
    }
    if (needsItems(service)) metadata.items = items

    try {
      const res = await fetch(edit ? `/api/jobs/${edit.id}` : '/api/jobs', {
        method: edit ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify(
          edit
            ? {
                metadata,
                description: note,
                attachments: imageUrls,
                attachmentsPublicIds: imagePublicIds,
              }
            : {
                metadata,
                note: note.trim() || undefined,
                attachments: imageUrls,
                attachmentsPublicIds: imagePublicIds,
                // Попередження вже бачили — це «Все одно створити».
                allowDuplicate: shownDuplicate ? true : undefined,
              },
        ),
      })
      const json = await res.json().catch(() => ({}))

      if (res.status === 409 && !edit && json?.duplicate) {
        duplicate = { job: json.duplicate as DuplicateJob, service }
        submitting = false
        return
      }

      if (!res.ok) {
        serverError =
          res.status === 429
            ? 'Забагато запитів. Зачекайте трохи і спробуйте ще раз.'
            : (json?.message ??
              json?.error ??
              (edit ? 'Не вдалось зберегти зміни' : 'Не вдалось створити заявку'))
        submitting = false // розблоковуємо для повтору
        return
      }

      // Редагування: сторінка змінюється на заявку — тост каже, що сталось.
      if (edit) {
        if (json?.changed !== false) toast.success('Заявку оновлено')
        await goto(`/dashboard/jobs/${edit.id}`, { invalidateAll: true })
        return
      }

      success = true
      celebrate()
      playSuccessSound()
      setTimeout(
        () => goto('/dashboard/jobs', { invalidateAll: true }),
        REDIRECT_DELAY,
      )
    } catch {
      serverError = "Помилка з'єднання. Перевірте інтернет і спробуйте ще раз."
      submitting = false
    }
  }

  // ─── Повторювані класи на токенах ───
  const tileCls =
    'group flex min-h-[124px] cursor-pointer flex-col items-start gap-3.5 rounded-[22px] border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-ring hover:shadow-md active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0'
  const tileIcCls =
    'flex size-[46px] items-center justify-center rounded-[14px] bg-muted text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground'
  function optCls(active: boolean, left = false) {
    return [
      'cursor-pointer rounded-[14px] border p-[13px] text-sm font-medium transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      left ? 'text-left' : 'text-center',
      active
        ? 'border-transparent bg-primary text-primary-foreground'
        : 'border-border bg-card text-foreground hover:border-ring',
    ].join(' ')
  }
  const stepBtnCls =
    'flex size-[34px] items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-ring hover:bg-muted active:scale-90 disabled:opacity-30 disabled:hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
  const primaryCls =
    'mt-1.5 inline-flex h-[52px] w-full items-center justify-center gap-[9px] rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground transition hover:-translate-y-px hover:bg-primary-hover active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:translate-y-0 disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:translate-y-0'
  const quickCls =
    'flex-1 cursor-pointer rounded-[18px] border border-border bg-card p-4 text-[14.5px] font-semibold text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-ring hover:shadow-md active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0'
</script>

<div class="job-scope flex min-h-(--app-h) flex-col items-center px-4 py-8">
  {#if success}
    <!-- ═══ Екран успіху ═══ -->
    <div
      class="flex flex-1 flex-col items-center justify-center text-center"
      in:scale={{ duration: 400, start: 0.85, easing: quintOut }}
      role="status"
      aria-live="polite"
    >
      <div class="mb-6"><SuccessCheck size={96} /></div>
      <h1 class="mb-2 text-[26px] font-bold tracking-[-0.03em] text-foreground">
        Готово!
      </h1>
      <p class="max-w-xs text-base leading-relaxed text-muted-foreground">
        <span class="font-semibold text-foreground">Zunor</span> уже шукає вам майстра.
      </p>
    </div>
  {:else}
    <div class="w-full max-w-122">
      <!-- Header: прогрес + назад. У редагуванні прогресу немає: кроки
           відкриваються зі зведення в будь-якому порядку. -->
      {#if edit}
        <div class="mb-5 flex h-6 items-center">
          {#if step === 5}
            <a
              href="/dashboard/jobs/{edit.id}"
              class="inline-flex items-center gap-1.5 rounded-md text-[13.5px] font-medium text-muted-foreground transition-opacity hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ArrowLeft class="size-4" aria-hidden="true" /> До заявки
            </a>
          {:else}
            <button
              type="button"
              onclick={back}
              class="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-[13.5px] font-medium text-muted-foreground transition-opacity hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ArrowLeft class="size-4" aria-hidden="true" /> Назад
            </button>
          {/if}
        </div>
      {:else}
      <div class="mb-7">
        <div class="mb-3 flex h-6 items-center justify-between">
          {#if step > 1}
            <button
              type="button"
              onclick={back}
              class="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-[13.5px] font-medium text-muted-foreground transition-opacity hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ArrowLeft class="size-4" aria-hidden="true" /> Назад
            </button>
          {:else}
            <span></span>
          {/if}
          <span
            class="text-[12.5px] font-semibold tabular-nums text-muted-foreground"
            >{step} / 5</span
          >
        </div>
        <div
          class="h-1 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={5}
          aria-label="Прогрес замовлення"
        >
          <div
            class="h-full rounded-full bg-primary transition-all duration-400 ease-out"
            style:width={`${(step / 5) * 100}%`}
          ></div>
        </div>
      </div>
      {/if}

      <div
        class="rounded-[32px] border border-border bg-card p-7 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.1),0_8px_20px_-8px_rgba(0,0,0,0.05)]"
      >
        <!-- ═══ Крок 1 ═══ -->
        {#if step === 1}
          <div in:fly={stepIn}>
            <h1
              class="mb-5.5 text-[27px] font-bold tracking-[-0.035em] text-foreground"
            >
              Що прибираємо?
            </h1>
            <div class="grid grid-cols-2 gap-3">
              {#each PREMISES as p (p.key)}
                {@const Icon = iconByName(p.icon)}
                <button
                  type="button"
                  onclick={() => selectPremise(p.key)}
                  class={tileCls}
                >
                  <span class={tileIcCls}
                    ><Icon
                      size={23}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    /></span
                  >
                  <span
                    class="text-[15.5px] font-semibold tracking-[-0.01em] text-foreground"
                    >{p.label}</span
                  >
                </button>
              {/each}
            </div>
          </div>

          <!-- ═══ Крок 2 ═══ -->
        {:else if step === 2}
          <div in:fly={stepIn}>
            <h1
              class="mb-5.5 text-[27px] font-bold tracking-[-0.035em] text-foreground"
            >
              Яке прибирання?
            </h1>
            <div class="grid grid-cols-2 gap-3">
              {#each SERVICES as s (s.key)}
                {@const Icon = iconByName(s.icon)}
                <button
                  type="button"
                  onclick={() => selectService(s.key)}
                  class={tileCls}
                >
                  <span class={tileIcCls}
                    ><Icon
                      size={23}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    /></span
                  >
                  <span
                    class="text-[15.5px] font-semibold tracking-[-0.01em] text-foreground"
                    >{s.label}</span
                  >
                </button>
              {/each}
            </div>
          </div>

          <!-- ═══ Крок 3 ═══ -->
        {:else if step === 3}
          <div in:fly={stepIn}>
            <h1
              class="mb-5.5 text-[27px] font-bold tracking-[-0.035em] text-foreground"
            >
              Деталі
            </h1>

            {#if needsRooms(service)}
              <div class="mb-5.5">
                <span
                  class="mb-2.75 block text-[13.5px] font-semibold text-foreground"
                  >Кількість кімнат</span
                >
                <div class="grid grid-cols-2 gap-2.25">
                  {#each ROOM_OPTIONS as o (o.key)}
                    <button
                      type="button"
                      onclick={() => (rooms = o.key)}
                      aria-pressed={rooms === o.key}
                      class={optCls(rooms === o.key)}>{o.label}</button
                    >
                  {/each}
                </div>
              </div>

              {#if needsFrequency(service)}
                <div class="mb-5.5">
                  <span
                    class="mb-2.75 block text-[13.5px] font-semibold text-foreground"
                    >Як часто</span
                  >
                  <div class="flex flex-col gap-2.25">
                    {#each FREQUENCY_OPTIONS as o (o.key)}
                      <button
                        type="button"
                        onclick={() => (frequency = o.key)}
                        aria-pressed={frequency === o.key}
                        class={optCls(frequency === o.key, true)}
                        >{o.label}</button
                      >
                    {/each}
                  </div>
                </div>
              {/if}

              {#if needsTrash(service)}
                <div class="mb-5.5">
                  <span
                    class="mb-2.75 block text-[13.5px] font-semibold text-foreground"
                    >Сміття</span
                  >
                  <div class="flex flex-col gap-2.25">
                    {#each TRASH_OPTIONS as o (o.key)}
                      <button
                        type="button"
                        onclick={() => (trash = o.key)}
                        aria-pressed={trash === o.key}
                        class={optCls(trash === o.key, true)}>{o.label}</button
                      >
                    {/each}
                  </div>
                </div>
              {/if}

              <div class="mb-5.5">
                <label
                  for="floor"
                  class="mb-2.75 block text-[13.5px] font-semibold text-foreground"
                  >Поверх <span class="font-normal text-muted-foreground"
                    >(необов'язково)</span
                  ></label
                >
                <Input
                  id="floor"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="200"
                  bind:value={floor}
                  placeholder="Напр. 5"
                  class="job-input mb-2.25"
                />
                <div class="grid grid-cols-2 gap-2.25">
                  {#each ELEVATOR_OPTIONS as o (o.key)}
                    <button
                      type="button"
                      onclick={() => (hasElevator = o.key)}
                      aria-pressed={hasElevator === o.key}
                      class={optCls(hasElevator === o.key)}>{o.label}</button
                    >
                  {/each}
                </div>
              </div>
            {/if}

            {#if needsWindows(service)}
              <div class="mb-5.5">
                <label
                  for="wc"
                  class="mb-2.75 block text-[13.5px] font-semibold text-foreground"
                  >Кількість вікон</label
                >
                <Input
                  id="wc"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="200"
                  bind:value={windowsCount}
                  placeholder="Напр. 5"
                  class="job-input"
                />
              </div>
              <div class="mb-5.5">
                <span
                  class="mb-2.75 block text-[13.5px] font-semibold text-foreground"
                  >З якого боку мити</span
                >
                <div class="grid grid-cols-3 gap-2.25">
                  {#each WINDOW_SIDE_OPTIONS as o (o.key)}
                    <button
                      type="button"
                      onclick={() => (windowSide = o.key)}
                      aria-pressed={windowSide === o.key}
                      class={optCls(windowSide === o.key)}>{o.label}</button
                    >
                  {/each}
                </div>
              </div>
              <div class="mb-5.5">
                <label
                  for="wfloor"
                  class="mb-2.75 block text-[13.5px] font-semibold text-foreground"
                  >Поверх <span class="font-normal text-muted-foreground"
                    >(необов'язково)</span
                  ></label
                >
                <Input
                  id="wfloor"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="200"
                  bind:value={floor}
                  placeholder="Напр. 5"
                  class="job-input"
                />
              </div>
              <div class="mb-5.5">
                <span
                  class="mb-2.75 block text-[13.5px] font-semibold text-foreground"
                  >З якого боку мити</span
                >
                <div class="grid grid-cols-3 gap-2.25">
                  {#each WINDOW_SIDE_OPTIONS as o (o.key)}
                    <button
                      type="button"
                      onclick={() => (windowSide = o.key)}
                      aria-pressed={windowSide === o.key}
                      class={optCls(windowSide === o.key)}>{o.label}</button
                    >
                  {/each}
                </div>
              </div>
            {/if}

            {#if needsItems(service)}
              <div class="mb-5.5 flex flex-col gap-3">
                {#each SOFA_ITEMS as item (item.key)}
                  <div class="rounded-[18px] border border-border bg-muted p-4">
                    <span
                      class="mb-3 block text-sm font-semibold text-foreground"
                      >{item.label}</span
                    >
                    {#if item.variants}
                      <div class="flex flex-col">
                        {#each item.variants as v, vi (v.key)}
                          {@const qty = itemQty(item.key, v.key)}
                          <div
                            class="flex items-center justify-between py-1 {vi >
                            0
                              ? 'mt-1 border-t border-border pt-3'
                              : ''}"
                          >
                            <span class="text-sm text-foreground"
                              >{v.label}</span
                            >
                            <div class="inline-flex items-center gap-2.5">
                              <button
                                type="button"
                                onclick={() => removeItem(item.key, v.key)}
                                disabled={qty === 0}
                                aria-label="Прибрати {v.label}"
                                class={stepBtnCls}
                                ><Minus
                                  class="size-4"
                                  aria-hidden="true"
                                /></button
                              >
                              <span
                                class="w-5.5 text-center text-[15px] font-bold tabular-nums"
                                >{qty}</span
                              >
                              <button
                                type="button"
                                onclick={() => addItem(item.key, v.key)}
                                aria-label="Додати {v.label}"
                                class={stepBtnCls}
                                ><Plus
                                  class="size-4"
                                  aria-hidden="true"
                                /></button
                              >
                            </div>
                          </div>
                        {/each}
                      </div>
                    {:else}
                      {@const qty = itemQty(item.key)}
                      <div class="flex items-center justify-end gap-2.5">
                        <button
                          type="button"
                          onclick={() => removeItem(item.key)}
                          disabled={qty === 0}
                          aria-label="Прибрати {item.label}"
                          class={stepBtnCls}
                          ><Minus class="size-4" aria-hidden="true" /></button
                        >
                        <span
                          class="w-5.5 text-center text-[15px] font-bold tabular-nums"
                          >{qty}</span
                        >
                        <button
                          type="button"
                          onclick={() => addItem(item.key)}
                          aria-label="Додати {item.label}"
                          class={stepBtnCls}
                          ><Plus class="size-4" aria-hidden="true" /></button
                        >
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}

            <button
              type="button"
              onclick={goToWhen}
              disabled={!step3Valid}
              class={primaryCls}>Далі</button
            >
          </div>

          <!-- ═══ Крок 4 ═══ -->
        {:else if step === 4}
          <div in:fly={stepIn}>
            <h1
              class="mb-5.5 text-[27px] font-bold tracking-[-0.035em] text-foreground"
            >
              Коли потрібно?
            </h1>
            <div class="mb-4 flex gap-2.5">
              {#each QUICK_WHEN as w (w.key)}
                <button
                  type="button"
                  onclick={() => selectQuickWhen(w.key)}
                  class={quickCls}>{w.label}</button
                >
              {/each}
            </div>
            <div
              class="wizard-calendar rounded-[22px] border border-border bg-muted p-4.5"
            >
              <Calendar
                type="single"
                locale="uk-UA"
                weekdayFormat="short"
                bind:value={calendarValue}
                minValue={todayDate}
                onValueChange={onCalendarPick}
                class="w-full bg-transparent! p-0 [--cell-size:clamp(36px,8vw,40px)]"
              />
            </div>
            <p class="mt-3 text-center text-xs text-muted-foreground">
              Точна дата допоможе клінеру одразу зрозуміти, чи він вільний
            </p>
          </div>

          <!-- ═══ Крок 5 ═══ -->
        {:else if step === 5}
          <div in:fly={stepIn}>
            <h1
              class="mb-1.5 text-[27px] font-bold tracking-[-0.035em] text-foreground"
            >
              {edit ? 'Зміни в заявці' : 'Майже готово'}
            </h1>
            <p class="mb-6 text-sm text-muted-foreground">{previewTitle}</p>

            {#if edit}
              <!-- Зведення: кожен пункт веде на свій крок, звідти — назад
                   сюди. Як рядки налаштувань: підпис, значення, стрілка. -->
              <div
                class="mb-5.5 flex flex-col rounded-[18px] border border-border"
              >
                {#each [{ label: 'Що прибираємо', value: premiseLabel, to: 1 }, { label: 'Прибирання', value: serviceLabel, to: 2 }, { label: 'Деталі', value: detailsLabel, to: 3 }, { label: 'Коли', value: whenLabel, to: 4 }] as row (row.to)}
                  {#if row.to !== 3 || detailsLabel}
                    <button
                      type="button"
                      onclick={() => (step = row.to)}
                      class="group flex cursor-pointer items-center gap-3 border-t border-border/60 px-4 py-3 text-left first:border-t-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      <span class="min-w-0 flex-1">
                        <span class="block text-[12.5px] text-muted-foreground"
                          >{row.label}</span
                        >
                        <span
                          class="block truncate text-[14.5px] font-medium text-foreground"
                          >{row.value || 'Оберіть'}</span
                        >
                      </span>
                      <span
                        class="flex items-center gap-0.5 text-[13px] font-medium text-primary group-hover:text-primary-hover"
                      >
                        Змінити <ChevronRight class="size-4" aria-hidden="true" />
                      </span>
                    </button>
                  {/if}
                {/each}
              </div>
            {/if}

            <div class="mb-5.5">
              <span
                class="mb-2.75 block text-[13.5px] font-semibold text-foreground"
                >Фото <span class="font-normal text-muted-foreground"
                  >(допоможе клінеру оцінити обсяг)</span
                ></span
              >
              <PortfolioUploader
                bind:images={imageUrls}
                bind:publicIds={imagePublicIds}
                bind:uploading
                maxItems={6}
                deferRemove={!!edit}
                onError={(msg) => (serverError = msg)}
              />
            </div>

            <div class="mb-5.5">
              <label
                for="note"
                class="mb-2.75 block text-[13.5px] font-semibold text-foreground"
                >{edit ? 'Опис' : 'Коментар'}
                <span class="font-normal text-muted-foreground"
                  >(необов'язково)</span
                ></label
              >
              <Textarea
                id="note"
                bind:value={note}
                placeholder="Особливі побажання, деталі доступу..."
                rows={edit ? 6 : 4}
                maxlength={edit ? 2000 : 1000}
                class="job-input resize-none py-4 leading-relaxed"
              />
            </div>

            {#if edit && edit.proposals > 0}
              <p
                class="mb-4 rounded-[14px] bg-muted px-4 py-3 text-[13.5px] leading-relaxed text-muted-foreground"
              >
                {edit.proposals === 1
                  ? 'Один майстер уже надіслав пропозицію.'
                  : `Майстрів із пропозиціями: ${edit.proposals}.`}
                Ми повідомимо про зміни — ціна могла бути на старі умови.
              </p>
            {/if}

            {#if shownDuplicate}
              <DuplicateNotice
                duplicate={shownDuplicate}
                {service}
                class="mb-4"
              />
            {/if}

            {#if serverError}
              <div
                class="mb-4 rounded-[14px] border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                {serverError}
              </div>
            {/if}

            <button
              type="button"
              onclick={submit}
              disabled={submitting || uploading}
              aria-busy={submitting}
              class={`${primaryCls} relative`}
            >
              <span class="pointer-events-none inline-flex items-center gap-2">
                {#if submitting}
                  Зачекайте...
                {:else}
                  {edit
                    ? 'Зберегти зміни'
                    : shownDuplicate
                      ? 'Все одно створити'
                      : 'Замовити прибирання'}
                {/if}
              </span>

              {#if submitting}
                <Spinner
                  class="absolute right-4 animate-spin"
                  aria-hidden="true"
                />
              {/if}
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /* Input / Textarea — на токенах. :global бо клас іде в shadcn-компонент;
     обмежено .job-scope. padding-left/right (не shorthand), щоб py-* у textarea не конфліктував.
     Фон і рамка — ті самі, що в усіх полів (--field, --input), лише
     вищі й круглі під крок майстра. */
  .job-scope :global(.job-input) {
    width: 100%;
    min-height: 50px;
    padding-left: 16px;
    padding-right: 16px;
    border-radius: 14px;
    border: 1px solid var(--input);
    background: var(--field);
    color: var(--foreground);
    font-size: 14.5px;
    font-weight: 500;
    outline: none;
    transition:
      border-color 0.16s ease,
      background 0.16s ease,
      box-shadow 0.16s ease;
  }
  .job-scope :global(.job-input::placeholder) {
    color: var(--muted-foreground);
    font-weight: 400;
  }
  .job-scope :global(.job-input:focus),
  .job-scope :global(.job-input:focus-within) {
    background: var(--background);
    border-color: var(--ring);
    box-shadow: 0 0 0 4px color-mix(in oklch, var(--ring) 22%, transparent);
  }

  .wizard-calendar :global(td) {
    width: calc(100% / 7);
  }
  .wizard-calendar :global(th) {
    width: calc(100% / 7) !important;
    text-align: center;
  }
  .wizard-calendar :global(td [role='button']:not([data-disabled])),
  .wizard-calendar :global(td button:not([data-disabled])) {
    cursor: pointer;
  }

  @media (prefers-reduced-motion: reduce) {
    .job-scope :global(.job-input) {
      transition: none;
    }
  }
</style>
