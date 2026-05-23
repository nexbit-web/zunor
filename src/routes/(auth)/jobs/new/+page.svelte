<!-- src/routes/(auth)/jobs/new/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Spinner } from '$lib/components/ui/spinner'
  import { Calendar } from '$lib/components/ui/calendar'
  import PortfolioUploader from '$lib/components/portfolio-uploader.svelte'
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
  import * as Icons from '@lucide/svelte'
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
  import Check from '@lucide/svelte/icons/check'
  import Plus from '@lucide/svelte/icons/plus'
  import Minus from '@lucide/svelte/icons/minus'
  import {
    getLocalTimeZone,
    today,
    type DateValue,
  } from '@internationalized/date'

  let { data } = $props()

  // ─── Wizard state ───
  let step = $state(1)
  let premise = $state('')
  let service = $state('')

  // деталі (адаптивні)
  let rooms = $state('')
  let floor = $state('')
  let hasElevator = $state('')
  let trash = $state('')
  let frequency = $state('')
  let windowsCount = $state('')
  let balcony = $state('')
  let items = $state<CleaningItem[]>([])

  // коли
  let when = $state('')
  let calendarValue = $state<DateValue | undefined>(undefined)

  // підтвердження
  let note = $state('')
  let imageUrls = $state<string[]>([])
  let imagePublicIds = $state<string[]>([])
  let uploading = $state(false)

  let submitting = $state(false)
  let serverError = $state('')

  const todayDate = today(getLocalTimeZone())

  // ─── Icon helper ───
  function iconByName(name: string): any {
    return (Icons as Record<string, unknown>)[name] ?? Icons.Square
  }

  // ─── Step 3 валідність (чи можна йти далі) ───
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

  // ─── Прев'ю заголовка ───
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

  // ─── Хімчистка: керування предметами ───
  function itemQty(type: string, variant?: string): number {
    const found = items.find(
      (i) => i.type === type && (i.variant ?? '') === (variant ?? ''),
    )
    return found?.qty ?? 0
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
    premise = key
    step = 2
  }
  function selectService(key: string) {
    service = key
    // скидаємо деталі при зміні послуги
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

  // ─── Submit ───
  async function submit() {
    if (submitting) return
    submitting = true
    serverError = ''

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
        serverError = json?.message ?? json?.error ?? 'Помилка сервера'
        return
      }
      goto('/jobs', { invalidateAll: true })
    } catch {
      serverError = "Помилка з'єднання"
    } finally {
      submitting = false
    }
  }
</script>

<svelte:head>
  <title>Замовити прибирання · Zunor</title>
</svelte:head>

<div class="min-h-svh flex flex-col items-center px-4 py-8 bg-background">
  <div class="w-full max-w-lg">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8 h-9">
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
      <span class="text-xs font-medium text-muted-foreground tabular-nums">
        Крок {step} з 5
      </span>
    </div>

    <!-- ═══ Крок 1: Помешкання ═══ -->
    {#if step === 1}
      <h1 class="text-2xl font-bold tracking-tight text-foreground mb-6">
        Що прибираємо?
      </h1>
      <div class="grid grid-cols-2 gap-3">
        {#each PREMISES as p (p.key)}
          {@const Icon = iconByName(p.icon)}
          <button
            type="button"
            onclick={() => selectPremise(p.key)}
            class="flex flex-col items-start gap-3 p-5 rounded-2xl border border-border bg-card hover:border-foreground/40 hover:shadow-md transition-all min-h-[120px] cursor-pointer"
          >
            <Icon size={28} strokeWidth={1.5} class="text-foreground" />
            <span class="text-base font-semibold text-foreground"
              >{p.label}</span
            >
          </button>
        {/each}
      </div>
    {/if}

    <!-- ═══ Крок 2: Послуга ═══ -->
    {#if step === 2}
      <h1 class="text-2xl font-bold tracking-tight text-foreground mb-6">
        Яке прибирання?
      </h1>
      <div class="grid grid-cols-2 gap-3">
        {#each SERVICES as s (s.key)}
          {@const Icon = iconByName(s.icon)}
          <button
            type="button"
            onclick={() => selectService(s.key)}
            class="flex flex-col items-start gap-3 p-5 rounded-2xl border border-border bg-card hover:border-foreground/40 hover:shadow-md transition-all min-h-[120px] cursor-pointer"
          >
            <Icon size={28} strokeWidth={1.5} class="text-foreground" />
            <span class="text-base font-semibold text-foreground"
              >{s.label}</span
            >
          </button>
        {/each}
      </div>
    {/if}

    <!-- ═══ Крок 3: Деталі (адаптивні) ═══ -->
    {#if step === 3}
      <h1 class="text-2xl font-bold tracking-tight text-foreground mb-6">
        Деталі
      </h1>

      <!-- Житлові: кімнати -->
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
                class="p-3 rounded-xl border text-sm font-medium cursor-pointer transition-all
                  {rooms === o.key
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-foreground hover:border-foreground/40'}"
              >
                {o.label}
              </button>
            {/each}
          </div>
        </div>

        <!-- Регулярне: частота -->
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
                  class="p-3 rounded-xl border text-sm font-medium text-left cursor-pointer transition-all
                    {frequency === o.key
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-card text-foreground hover:border-foreground/40'}"
                >
                  {o.label}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Після ремонту: сміття -->
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
                  class="p-3 rounded-xl border text-sm font-medium text-left cursor-pointer transition-all
                    {trash === o.key
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-card text-foreground hover:border-foreground/40'}"
                >
                  {o.label}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Поверх + ліфт -->
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
                class="p-3 rounded-xl border text-sm font-medium cursor-pointer transition-all
                  {hasElevator === o.key
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-foreground hover:border-foreground/40'}"
              >
                {o.label}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Вікна -->
      {#if needsWindows(service)}
        <div class="mb-5">
          <label for="wc" class="block text-sm font-medium text-foreground mb-2"
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
                class="p-3 rounded-xl border text-sm font-medium cursor-pointer transition-all
                  {balcony === o.key
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-foreground hover:border-foreground/40'}"
              >
                {o.label}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Хімчистка: предмети -->
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
                          class="size-8 rounded-full border border-border flex items-center justify-center cursor-pointer disabled:opacity-30 hover:bg-secondary"
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
                          class="size-8 rounded-full border border-border flex items-center justify-center cursor-pointer hover:bg-secondary"
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
                    class="size-8 rounded-full border border-border flex items-center justify-center cursor-pointer disabled:opacity-30 hover:bg-secondary"
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
                    class="size-8 rounded-full border border-border flex items-center justify-center cursor-pointer hover:bg-secondary"
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
    {/if}

    <!-- ═══ Крок 4: Коли ═══ -->
    {#if step === 4}
      <h1 class="text-2xl font-bold tracking-tight text-foreground mb-6">
        Коли потрібно?
      </h1>
      <div class="flex gap-2 mb-4">
        {#each QUICK_WHEN as w (w.key)}
          <button
            type="button"
            onclick={() => selectQuickWhen(w.key)}
            class="flex-1 p-4 rounded-2xl border border-border bg-card text-base font-semibold text-foreground hover:border-foreground/40 hover:shadow-md transition-all cursor-pointer"
          >
            {w.label}
          </button>
        {/each}
      </div>
      <div
        class="rounded-2xl border border-border bg-card p-3 flex justify-center"
      >
        <Calendar
          type="single"
          bind:value={calendarValue}
          minValue={todayDate}
          onValueChange={onCalendarPick}
        />
      </div>
    {/if}

    <!-- ═══ Крок 5: Підтвердження ═══ -->
    {#if step === 5}
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
    {/if}
  </div>
</div>
