<!-- src/routes/(auth)/jobs/new/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Spinner } from '$lib/components/ui/spinner'
  import { Calendar } from '$lib/components/ui/calendar'
  import PortfolioUploader from '$lib/components/portfolio-uploader.svelte'
  import SuccessCheck from '$lib/components/success-check.svelte'
  import {
    PREMISES,
    SERVICES,
    ROOM_OPTIONS,
    ELEVATOR_OPTIONS,
    BALCONY_OPTIONS,
    TRASH_OPTIONS,
    FREQUENCY_OPTIONS,
    SOFA_ITEMS,
    QUICK_WHEN,
    needsRooms,
    needsWindows,
    needsItems,
    needsFrequency,
    needsTrash,
  } from '$lib/categories/cleaning/presets'
  import { generateTitle } from '$lib/categories/cleaning/title-gen'
  import type { CleaningItem } from '$lib/categories/cleaning/title-gen'
  // Іконки імпортуємо поштучно (не `import * as`), інакше в бандл потрапляє
  // вся бібліотека lucide. ICONS — лише ті, що згадані в пресетах.
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
  import Check from '@lucide/svelte/icons/check'
  import Plus from '@lucide/svelte/icons/plus'
  import Minus from '@lucide/svelte/icons/minus'
  import Square from '@lucide/svelte/icons/square'
  import Building2 from '@lucide/svelte/icons/building-2'
  import Home from '@lucide/svelte/icons/home'
  import Briefcase from '@lucide/svelte/icons/briefcase'
  import Store from '@lucide/svelte/icons/store'
  import Boxes from '@lucide/svelte/icons/boxes'
  import Sparkle from '@lucide/svelte/icons/sparkle'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import Hammer from '@lucide/svelte/icons/hammer'
  import GlassWater from '@lucide/svelte/icons/glass-water'
  import Sofa from '@lucide/svelte/icons/sofa'
  import Repeat from '@lucide/svelte/icons/repeat'
  import {
    getLocalTimeZone,
    today,
    type DateValue,
  } from '@internationalized/date'
  import { fly, scale } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import confetti from 'canvas-confetti'
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

  // ─── State ───
  let step = $state(1)
  let premise = $state('')
  let service = $state('')

  let rooms = $state('')
  let floor = $state('')
  let hasElevator = $state('')
  let trash = $state('')
  let frequency = $state('')
  let windowsCount = $state('')
  let balcony = $state('')
  let items = $state<CleaningItem[]>([])

  let when = $state('')
  let calendarValue = $state<DateValue | undefined>(undefined)

  let note = $state('')
  let imageUrls = $state<string[]>([])
  let imagePublicIds = $state<string[]>([])
  let uploading = $state(false)

  let submitting = $state(false)
  let success = $state(false)
  let serverError = $state('')

  const todayDate = today(getLocalTimeZone())

  // Крок 3 адаптивний: набір обовʼязкових полів залежить від послуги.
  const step3Valid = $derived.by(() => {
    if (needsItems(service)) return items.length > 0
    if (needsWindows(service))
      return windowsCount !== '' && Number(windowsCount) > 0
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
    balcony: balcony || undefined,
    items: items.length ? items : undefined,
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
  function selectPremise(key: string) {
    unlockAudio() // розблоковуємо звук на першу взаємодію (autoplay policy браузера)
    premise = key
    step = 2
  }
  function selectService(key: string) {
    service = key
    // Зміна послуги скидає всі деталі попередньої — поля кроку 3 інші.
    rooms = ''
    floor = ''
    hasElevator = ''
    trash = ''
    frequency = ''
    windowsCount = ''
    balcony = ''
    items = []
    step = 3
  }
  function goToWhen() {
    if (step3Valid) step = 4
  }
  function selectQuickWhen(key: string) {
    when = key
    calendarValue = undefined
    step = 5
  }
  function onCalendarPick(v: DateValue | undefined) {
    if (v) {
      when = v.toString()
      step = 5
    }
  }
  function back() {
    if (step > 1) step--
  }

  function celebrate() {
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
      if (floor) metadata.floor = Number(floor)
      if (balcony) metadata.balcony = balcony
    }
    if (needsItems(service)) metadata.items = items

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          metadata,
          note: note.trim() || undefined,
          attachments: imageUrls,
          attachmentsPublicIds: imagePublicIds,
        }),
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        serverError =
          res.status === 429
            ? 'Забагато запитів. Зачекайте трохи і спробуйте ще раз.'
            : (json?.message ?? json?.error ?? 'Не вдалось створити заявку')
        submitting = false // розблоковуємо кнопку, щоб користувач міг повторити
        return
      }

      success = true
      celebrate()
      playSuccessSound()
      setTimeout(() => goto('/jobs', { invalidateAll: true }), REDIRECT_DELAY)
    } catch {
      serverError = "Помилка з'єднання. Перевірте інтернет і спробуйте ще раз."
      submitting = false
    }
  }
</script>

<svelte:head>
  <title>Замовити прибирання · Zunor</title>
</svelte:head>

<div class="min-h-svh flex flex-col items-center px-4 py-8 bg-background">
  {#if success}
    <!-- ═══ Екран успіху ═══ -->
    <div
      class="flex-1 flex flex-col items-center justify-center text-center"
      in:scale={{ duration: 400, start: 0.85, easing: quintOut }}
    >
      <div class="mb-6">
        <SuccessCheck size={96} />
      </div>
      <h1 class="text-2xl font-bold tracking-tight text-foreground mb-2">
        Готово!
      </h1>
      <p class="text-base text-muted-foreground max-w-xs">
        <span class="font-semibold text-foreground">Zuna:</span> я вже шукаю тобі
        майстра.
      </p>
    </div>
  {:else}
    <div class="w-full max-w-lg">
      <!-- Header: прогрес-бар + назад -->
      <div class="mb-8">
        <div class="flex items-center justify-between h-9 mb-3">
          {#if step > 1}
            <button
              type="button"
              onclick={back}
              class="inline-flex items-center gap-1.5 text-sm cursor-pointer hover:opacity-70 transition-opacity text-muted-foreground"
            >
              <ArrowLeft class="size-4" /> Назад
            </button>
          {:else}
            <span></span>
          {/if}
          <span class="text-xs font-medium text-muted-foreground tabular-nums"
            >{step} / 5</span
          >
        </div>
        <div class="h-1 w-full rounded-full overflow-hidden bg-secondary">
          <div
            class="h-full rounded-full bg-foreground transition-all duration-300 ease-out"
            style="width: {(step / 5) * 100}%"
          ></div>
        </div>
      </div>

      <!-- ═══ Крок 1: Помешкання ═══ -->
      {#if step === 1}
        <div in:fly={stepIn}>
          <h1 class="text-2xl font-bold tracking-tight text-foreground mb-6">
            Що прибираємо?
          </h1>
          <div class="grid grid-cols-2 gap-3">
            {#each PREMISES as p (p.key)}
              {@const Icon = iconByName(p.icon)}
              <button
                type="button"
                onclick={() => selectPremise(p.key)}
                class="group flex flex-col items-start gap-3 p-5 rounded-2xl border border-border bg-card hover:border-foreground/40 hover:shadow-md active:scale-[0.98] transition-all min-h-30 cursor-pointer"
              >
                <span
                  class="flex items-center justify-center size-11 rounded-xl bg-secondary group-hover:bg-foreground group-hover:text-background transition-colors"
                >
                  <Icon size={22} strokeWidth={1.75} />
                </span>
                <span class="text-base font-semibold text-foreground"
                  >{p.label}</span
                >
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- ═══ Крок 2: Послуга ═══ -->
      {#if step === 2}
        <div in:fly={stepIn}>
          <h1 class="text-2xl font-bold tracking-tight text-foreground mb-6">
            Яке прибирання?
          </h1>
          <div class="grid grid-cols-2 gap-3">
            {#each SERVICES as s (s.key)}
              {@const Icon = iconByName(s.icon)}
              <button
                type="button"
                onclick={() => selectService(s.key)}
                class="group flex flex-col items-start gap-3 p-5 rounded-2xl border border-border bg-card hover:border-foreground/40 hover:shadow-md active:scale-[0.98] transition-all min-h-30 cursor-pointer"
              >
                <span
                  class="flex items-center justify-center size-11 rounded-xl bg-secondary group-hover:bg-foreground group-hover:text-background transition-colors"
                >
                  <Icon size={22} strokeWidth={1.75} />
                </span>
                <span class="text-base font-semibold text-foreground"
                  >{s.label}</span
                >
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- ═══ Крок 3: Деталі ═══ -->
      {#if step === 3}
        <div in:fly={stepIn}>
          <h1 class="text-2xl font-bold tracking-tight text-foreground mb-6">
            Деталі
          </h1>

          {#if needsRooms(service)}
            <div class="mb-5">
              <span class="block text-sm font-medium text-foreground mb-2"
                >Кількість кімнат</span
              >
              <div class="grid grid-cols-2 gap-2">
                {#each ROOM_OPTIONS as o (o.key)}
                  <button
                    type="button"
                    onclick={() => (rooms = o.key)}
                    aria-pressed={rooms === o.key}
                    class="p-3 rounded-xl border text-sm font-medium cursor-pointer active:scale-[0.98] transition-all {rooms ===
                    o.key
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-card text-foreground hover:border-foreground/40'}"
                  >
                    {o.label}
                  </button>
                {/each}
              </div>
            </div>

            {#if needsFrequency(service)}
              <div class="mb-5">
                <span class="block text-sm font-medium text-foreground mb-2"
                  >Як часто</span
                >
                <div class="flex flex-col gap-2">
                  {#each FREQUENCY_OPTIONS as o (o.key)}
                    <button
                      type="button"
                      onclick={() => (frequency = o.key)}
                      aria-pressed={frequency === o.key}
                      class="p-3 rounded-xl border text-sm font-medium text-left cursor-pointer active:scale-[0.99] transition-all {frequency ===
                      o.key
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border bg-card text-foreground hover:border-foreground/40'}"
                    >
                      {o.label}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            {#if needsTrash(service)}
              <div class="mb-5">
                <span class="block text-sm font-medium text-foreground mb-2"
                  >Сміття</span
                >
                <div class="flex flex-col gap-2">
                  {#each TRASH_OPTIONS as o (o.key)}
                    <button
                      type="button"
                      onclick={() => (trash = o.key)}
                      aria-pressed={trash === o.key}
                      class="p-3 rounded-xl border text-sm font-medium text-left cursor-pointer active:scale-[0.99] transition-all {trash ===
                      o.key
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border bg-card text-foreground hover:border-foreground/40'}"
                    >
                      {o.label}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="mb-5">
              <label
                for="floor"
                class="block text-sm font-medium text-foreground mb-2"
              >
                Поверх <span class="text-muted-foreground font-normal"
                  >(необов'язково)</span
                >
              </label>
              <Input
                id="floor"
                type="number"
                inputmode="numeric"
                min="0"
                max="200"
                bind:value={floor}
                placeholder="Напр. 5"
                class="mb-2"
              />
              <div class="grid grid-cols-2 gap-2">
                {#each ELEVATOR_OPTIONS as o (o.key)}
                  <button
                    type="button"
                    onclick={() => (hasElevator = o.key)}
                    aria-pressed={hasElevator === o.key}
                    class="p-3 rounded-xl border text-sm font-medium cursor-pointer active:scale-[0.98] transition-all {hasElevator ===
                    o.key
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-card text-foreground hover:border-foreground/40'}"
                  >
                    {o.label}
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          {#if needsWindows(service)}
            <div class="mb-5">
              <label
                for="wc"
                class="block text-sm font-medium text-foreground mb-2"
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
              />
            </div>
            <div class="mb-5">
              <label
                for="wfloor"
                class="block text-sm font-medium text-foreground mb-2"
              >
                Поверх <span class="text-muted-foreground font-normal"
                  >(необов'язково)</span
                >
              </label>
              <Input
                id="wfloor"
                type="number"
                inputmode="numeric"
                min="0"
                max="200"
                bind:value={floor}
                placeholder="Напр. 5"
              />
            </div>
            <div class="mb-5">
              <span class="block text-sm font-medium text-foreground mb-2"
                >Балкон / лоджія</span
              >
              <div class="grid grid-cols-3 gap-2">
                {#each BALCONY_OPTIONS as o (o.key)}
                  <button
                    type="button"
                    onclick={() => (balcony = o.key)}
                    aria-pressed={balcony === o.key}
                    class="p-3 rounded-xl border text-sm font-medium cursor-pointer active:scale-[0.98] transition-all {balcony ===
                    o.key
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-card text-foreground hover:border-foreground/40'}"
                  >
                    {o.label}
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          {#if needsItems(service)}
            <div class="flex flex-col gap-4 mb-5">
              {#each SOFA_ITEMS as item (item.key)}
                <div class="rounded-2xl border border-border bg-card p-4">
                  <span class="block text-sm font-semibold text-foreground mb-3"
                    >{item.label}</span
                  >
                  {#if item.variants}
                    <div class="flex flex-col gap-2">
                      {#each item.variants as v (v.key)}
                        {@const qty = itemQty(item.key, v.key)}
                        <div class="flex items-center justify-between">
                          <span class="text-sm text-foreground">{v.label}</span>
                          <div class="flex items-center gap-2">
                            <button
                              type="button"
                              onclick={() => removeItem(item.key, v.key)}
                              disabled={qty === 0}
                              aria-label="Прибрати {v.label}"
                              class="size-8 rounded-full border border-border flex items-center justify-center cursor-pointer active:scale-90 disabled:opacity-30 hover:bg-secondary transition-all"
                            >
                              <Minus class="size-4" />
                            </button>
                            <span
                              class="w-6 text-center text-sm font-semibold tabular-nums"
                              >{qty}</span
                            >
                            <button
                              type="button"
                              onclick={() => addItem(item.key, v.key)}
                              aria-label="Додати {v.label}"
                              class="size-8 rounded-full border border-border flex items-center justify-center cursor-pointer active:scale-90 hover:bg-secondary transition-all"
                            >
                              <Plus class="size-4" />
                            </button>
                          </div>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    {@const qty = itemQty(item.key)}
                    <div class="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onclick={() => removeItem(item.key)}
                        disabled={qty === 0}
                        aria-label="Прибрати {item.label}"
                        class="size-8 rounded-full border border-border flex items-center justify-center cursor-pointer active:scale-90 disabled:opacity-30 hover:bg-secondary transition-all"
                      >
                        <Minus class="size-4" />
                      </button>
                      <span
                        class="w-6 text-center text-sm font-semibold tabular-nums"
                        >{qty}</span
                      >
                      <button
                        type="button"
                        onclick={() => addItem(item.key)}
                        aria-label="Додати {item.label}"
                        class="size-8 rounded-full border border-border flex items-center justify-center cursor-pointer active:scale-90 hover:bg-secondary transition-all"
                      >
                        <Plus class="size-4" />
                      </button>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          <Button
            onclick={goToWhen}
            disabled={!step3Valid}
            class="w-full h-12 text-base font-semibold"
          >
            Далі
          </Button>
        </div>
      {/if}

      <!-- ═══ Крок 4: Коли ═══ -->
      {#if step === 4}
        <div in:fly={stepIn}>
          <h1 class="text-2xl font-bold tracking-tight text-foreground mb-6">
            Коли потрібно?
          </h1>
          <div class="flex gap-2 mb-4">
            {#each QUICK_WHEN as w (w.key)}
              <button
                type="button"
                onclick={() => selectQuickWhen(w.key)}
                class="flex-1 p-4 rounded-2xl border border-border bg-card text-base font-semibold text-foreground hover:border-foreground/40 hover:shadow-md active:scale-[0.98] transition-all cursor-pointer"
              >
                {w.label}
              </button>
            {/each}
          </div>
          <div
            class="wizard-calendar rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <Calendar
              type="single"
              locale="uk-UA"
              weekdayFormat="short"
              bind:value={calendarValue}
              minValue={todayDate}
              onValueChange={onCalendarPick}
              class="w-full bg-transparent! p-0 [--cell-size:clamp(36px,8vw,38px)]"
            />
          </div>
          <p class="text-xs text-center text-muted-foreground mt-3">
            Точна дата допоможе клінеру одразу зрозуміти, чи він вільний
          </p>
        </div>
      {/if}

      <!-- ═══ Крок 5: Підтвердження ═══ -->
      {#if step === 5}
        <div in:fly={stepIn}>
          <h1 class="text-2xl font-bold tracking-tight text-foreground mb-2">
            Майже готово
          </h1>
          <p class="text-sm text-muted-foreground mb-6">{previewTitle}</p>

          <div class="mb-5">
            <span class="block text-sm font-medium text-foreground mb-2">
              Фото <span class="text-muted-foreground font-normal"
                >(допоможе клінеру оцінити обсяг)</span
              >
            </span>
            <PortfolioUploader
              bind:images={imageUrls}
              bind:publicIds={imagePublicIds}
              bind:uploading
              maxItems={6}
              onError={(msg) => (serverError = msg)}
            />
          </div>

          <div class="mb-5">
            <label
              for="note"
              class="block text-sm font-medium text-foreground mb-2"
            >
              Коментар <span class="text-muted-foreground font-normal"
                >(необов'язково)</span
              >
            </label>
            <Textarea
              id="note"
              bind:value={note}
              placeholder="Особливі побажання, деталі доступу..."
              rows={4}
              maxlength={1000}
              class="resize-none"
            />
          </div>

          {#if serverError}
            <div
              class="text-sm p-3 rounded-lg bg-destructive/8 text-destructive border border-destructive/20 mb-4"
              role="alert"
            >
              {serverError}
            </div>
          {/if}

          <Button
            onclick={submit}
            disabled={submitting || uploading}
            class="w-full h-12 text-base font-semibold gap-2"
          >
            {#if submitting}
              <Spinner /> Створюємо...
            {:else}
              <Check class="size-5" /> Замовити прибирання
            {/if}
          </Button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
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
</style>
