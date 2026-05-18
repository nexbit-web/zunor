<!-- src/routes/(auth)/jobs/new/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'
  import * as Field from '$lib/components/ui/field'
  import * as Popover from '$lib/components/ui/popover'
  import * as Command from '$lib/components/ui/command'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Calendar } from '$lib/components/ui/calendar'
  import { cn } from '$lib/utils'
  import {
    DateFormatter,
    getLocalTimeZone,
    today,
    type DateValue,
  } from '@internationalized/date'
  import { tick } from 'svelte'
  import CheckIcon from '@lucide/svelte/icons/check'
  import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down'
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle'
  import CalendarIcon from '@lucide/svelte/icons/calendar'
  import CircleCheckBigIcon from '@lucide/svelte/icons/circle-check-big'
  import type { PageData } from './$types'
  import { Spinner } from '$lib/components/ui/spinner'

  let { data }: { data: PageData } = $props()

  // ─── Constants ───────────────────────────────────────────
  const TITLE_MIN = 5
  const TITLE_MAX = 200
  const DESC_MIN = 30
  const DESC_MAX = 922
  const BUDGET_MAX = 10_000_000

  const dateFmt = new DateFormatter('uk-UA', { day: 'numeric', month: 'long' })
  const todayDate = today(getLocalTimeZone())

  // ─── Time presets ─────────────────────────────────────────
  type TimePreset = 'today' | 'tomorrow' | 'this-week' | 'custom' | ''

  const TIME_PRESETS: {
    key: Exclude<TimePreset, '' | 'custom'>
    label: string
  }[] = [
    { key: 'today', label: 'Сьогодні' },
    { key: 'tomorrow', label: 'Завтра' },
    { key: 'this-week', label: 'Цього тижня' },
  ]

  // ─── State ───────────────────────────────────────────────
  let category = $state('')
  let city = $state(data.userCity ?? '')
  let title = $state('')
  let description = $state('')

  let timePreset = $state<TimePreset>('')
  let dateFromOpen = $state(false)
  let dateToOpen = $state(false)
  let customDateFrom = $state<DateValue | undefined>(undefined)
  let customDateTo = $state<DateValue | undefined>(undefined)

  let budget = $state('')

  let triedSubmit = $state(false)
  let touchedTitle = $state(false)
  let touchedDesc = $state(false)
  let touchedBudget = $state(false)

  let categoryOpen = $state(false)
  let cityOpen = $state(false)
  let categoryTriggerRef = $state<HTMLButtonElement>(null!)
  let cityTriggerRef = $state<HTMLButtonElement>(null!)

  let submitting = false
  let loading = $state(false)
  let serverError = $state('')
  let successMessage = $state('')

  // ─── Derived ─────────────────────────────────────────────
  const titleTrim = $derived(title.trim())
  const descTrim = $derived(description.trim())

  const selectedCategoryName = $derived(
    data.categories.find((c) => c.slug === category)?.name ?? '',
  )
  const selectedCityName = $derived(
    data.cities.find((c) => c.slug === city)?.name ?? '',
  )

  function parseBudget(raw: string): number | null {
    const trimmed = String(raw).trim()
    if (!trimmed) return null
    const normalized = trimmed.replace(',', '.')
    const n = parseFloat(normalized)
    if (isNaN(n) || !isFinite(n) || n < 0 || n > BUDGET_MAX) return null
    return Math.round(n * 100) / 100
  }

  const budgetNum = $derived(parseBudget(budget))
  const budgetInvalid = $derived(budget.trim() !== '' && budgetNum === null)

  const categoryValid = $derived(!!category)
  const cityValid = $derived(!!city)
  const titleValid = $derived(
    titleTrim.length >= TITLE_MIN && titleTrim.length <= TITLE_MAX,
  )
  const descValid = $derived(
    descTrim.length >= DESC_MIN && descTrim.length <= DESC_MAX,
  )
  const budgetValid = $derived(!budgetInvalid)

  const formValid = $derived(
    categoryValid && cityValid && titleValid && descValid && budgetValid,
  )

  const showCategoryError = $derived(triedSubmit && !categoryValid)
  const showCityError = $derived(triedSubmit && !cityValid)

  const showTitleError = $derived((triedSubmit || touchedTitle) && !titleValid)
  const titleError = $derived(
    showTitleError
      ? titleTrim.length === 0
        ? 'Введіть заголовок'
        : titleTrim.length < TITLE_MIN
          ? `Мінімум ${TITLE_MIN} символів`
          : ''
      : '',
  )

  const showDescError = $derived((triedSubmit || touchedDesc) && !descValid)
  const descError = $derived(
    showDescError
      ? descTrim.length === 0
        ? 'Опишіть завдання детально'
        : descTrim.length < DESC_MIN
          ? `Ще ${DESC_MIN - descTrim.length} символів`
          : ''
      : '',
  )

  const budgetError = $derived(
    (triedSubmit || touchedBudget) && budgetInvalid
      ? 'Введіть коректну суму (від 0 до 10 000 000)'
      : '',
  )

  const dateFromLabel = $derived(
    customDateFrom
      ? dateFmt.format(customDateFrom.toDate(getLocalTimeZone()))
      : '',
  )
  const dateToLabel = $derived(
    customDateTo ? dateFmt.format(customDateTo.toDate(getLocalTimeZone())) : '',
  )

  // deadline для API: пресет або діапазон ISO-дат
  const deadlineValue = $derived.by(
    (): { from: string; to: string | null } | null => {
      if (!timePreset) return null
      if (timePreset === 'today') return { from: 'today', to: null }
      if (timePreset === 'tomorrow') return { from: 'tomorrow', to: null }
      if (timePreset === 'this-week') return { from: 'this-week', to: null }
      if (!customDateFrom) return null
      return {
        from: customDateFrom.toString(),
        to: customDateTo ? customDateTo.toString() : null,
      }
    },
  )

  // ─── Actions ─────────────────────────────────────────────
  function closeCategoryAndFocus() {
    categoryOpen = false
    tick().then(() => categoryTriggerRef?.focus())
  }
  function closeCityAndFocus() {
    cityOpen = false
    tick().then(() => cityTriggerRef?.focus())
  }

  function selectPreset(p: Exclude<TimePreset, '' | 'custom'>) {
    timePreset = timePreset === p ? '' : p
    customDateFrom = undefined
    customDateTo = undefined
  }

  // ─── Submit ───────────────────────────────────────────────
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (submitting) return
    submitting = true

    triedSubmit = true
    serverError = ''

    if (!formValid) {
      submitting = false
      if (!categoryValid) tick().then(() => categoryTriggerRef?.focus())
      else if (!cityValid) tick().then(() => cityTriggerRef?.focus())
      else if (!titleValid)
        tick().then(() =>
          (document.getElementById('title') as HTMLElement)?.focus(),
        )
      else if (!descValid)
        tick().then(() =>
          (document.getElementById('description') as HTMLElement)?.focus(),
        )
      return
    }

    loading = true
    try {
      const body: Record<string, unknown> = {
        category,
        city,
        title: titleTrim,
        description: descTrim,
        ...(deadlineValue !== null && { deadline: deadlineValue }),
        ...(budgetNum !== null && { budgetUah: budgetNum }),
      }

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify(body),
      })

      let json: Record<string, unknown> = {}
      try {
        json = await res.json()
      } catch {
        /* not json */
      }

      if (!res.ok) {
        serverError =
          typeof json?.message === 'string'
            ? json.message
            : typeof json?.error === 'string'
              ? json.error
              : `Помилка сервера (${res.status})`
        return
      }

      successMessage = 'Замовлення створено!'
      await new Promise((r) => setTimeout(r, 700))
      goto('/jobs', { invalidateAll: true })
    } catch (err) {
      console.error('[order:create]', err)
      serverError = "Помилка з'єднання. Перевірте інтернет і спробуйте ще раз."
    } finally {
      loading = false
      submitting = false
    }
  }
</script>

<svelte:head>
  <title>Нове замовлення · Zunor</title>
</svelte:head>

<div
  class="min-h-svh flex items-start justify-center px-4 py-10 md:py-16 bg-background"
>
  <div class="w-full max-w-md">
    <!-- Header -->
    <div class="mb-6">
      <h1
        class="text-2xl font-bold tracking-tight text-foreground"
        style="letter-spacing:-0.02em"
      >
        Нове замовлення
      </h1>
      <p class="text-sm mt-1.5 text-muted-foreground">
        Опишіть, що потрібно — майстри надішлють пропозиції
      </p>
    </div>

    <!-- Success banner -->
    {#if successMessage}
      <div
        class="flex items-center gap-3 p-4 rounded-xl mb-4 bg-primary/10 border border-primary/25"
        role="status"
      >
        <CircleCheckBigIcon class="size-5 shrink-0 text-primary" />
        <p class="text-sm font-medium text-foreground">{successMessage}</p>
      </div>
    {/if}

    <Card.Root>
      <Card.Content class="pt-6">
        <form onsubmit={handleSubmit} novalidate>
          <Field.Group>
            <!-- ══ 1. Категорія ══════════════════════ -->
            <Field.Field>
              <Field.Label id="category-label">Категорія</Field.Label>
              <Popover.Root bind:open={categoryOpen}>
                <Popover.Trigger bind:ref={categoryTriggerRef}>
                  {#snippet child({ props })}
                    <Button
                      {...props}
                      variant="outline"
                      role="combobox"
                      aria-expanded={categoryOpen}
                      aria-labelledby="category-label"
                      aria-invalid={showCategoryError}
                      aria-describedby={showCategoryError
                        ? 'category-error'
                        : undefined}
                      class={cn(
                        'w-full justify-between font-normal',
                        !category && 'text-muted-foreground',
                        showCategoryError && 'border-destructive',
                      )}
                    >
                      {selectedCategoryName || 'Оберіть категорію'}
                      <ChevronsUpDownIcon class="opacity-50" />
                    </Button>
                  {/snippet}
                </Popover.Trigger>
                <Popover.Content
                  class="w-(--bits-popover-anchor-width) p-0"
                  align="start"
                  sideOffset={6}
                >
                  <Command.Root>
                    <Command.Input placeholder="Пошук категорії..." />
                    <Command.List>
                      <Command.Empty>Нічого не знайдено</Command.Empty>
                      <Command.Group value="categories">
                        {#each data.categories as c (c.slug)}
                          <Command.Item
                            value={c.name}
                            onSelect={() => {
                              category = c.slug
                              closeCategoryAndFocus()
                            }}
                          >
                            <CheckIcon
                              class={cn(
                                category !== c.slug && 'text-transparent',
                              )}
                            />
                            {c.name}
                          </Command.Item>
                        {/each}
                      </Command.Group>
                    </Command.List>
                  </Command.Root>
                </Popover.Content>
              </Popover.Root>
              {#if showCategoryError}
                <Field.Description id="category-error" class="text-destructive">
                  Оберіть категорію
                </Field.Description>
              {/if}
            </Field.Field>

            <!-- ══ 2. Місто ══════════════════════════ -->
            <Field.Field>
              <Field.Label id="city-label">Місто</Field.Label>
              <Popover.Root bind:open={cityOpen}>
                <Popover.Trigger bind:ref={cityTriggerRef}>
                  {#snippet child({ props })}
                    <Button
                      {...props}
                      variant="outline"
                      role="combobox"
                      aria-expanded={cityOpen}
                      aria-labelledby="city-label"
                      aria-invalid={showCityError}
                      aria-describedby={showCityError
                        ? 'city-error'
                        : undefined}
                      class={cn(
                        'w-full justify-between font-normal',
                        !city && 'text-muted-foreground',
                        showCityError && 'border-destructive',
                      )}
                    >
                      {selectedCityName || 'Оберіть місто'}
                      <ChevronsUpDownIcon class="opacity-50" />
                    </Button>
                  {/snippet}
                </Popover.Trigger>
                <Popover.Content
                  class="w-(--bits-popover-anchor-width) p-0"
                  align="start"
                  sideOffset={6}
                >
                  <Command.Root>
                    <Command.Input placeholder="Пошук міста..." />
                    <Command.List>
                      <Command.Empty>Нічого не знайдено</Command.Empty>
                      <Command.Group value="cities">
                        {#each data.cities as c (c.slug)}
                          <Command.Item
                            value={c.name}
                            onSelect={() => {
                              city = c.slug
                              closeCityAndFocus()
                            }}
                          >
                            <CheckIcon
                              class={cn(city !== c.slug && 'text-transparent')}
                            />
                            {c.name}
                          </Command.Item>
                        {/each}
                      </Command.Group>
                    </Command.List>
                  </Command.Root>
                </Popover.Content>
              </Popover.Root>
              {#if showCityError}
                <Field.Description id="city-error" class="text-destructive">
                  Оберіть місто
                </Field.Description>
              {/if}
            </Field.Field>

            <!-- ══ 3. Заголовок ══════════════════════ -->
            <Field.Field>
              <div class="flex items-baseline justify-between">
                <Field.Label for="title">Заголовок</Field.Label>
                {#if titleTrim.length > 0}
                  <span
                    class={cn(
                      'text-[11px] tabular-nums transition-colors',
                      titleTrim.length > TITLE_MAX * 0.9
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                    aria-live="polite"
                  >
                    {titleTrim.length}/{TITLE_MAX}
                  </span>
                {/if}
              </div>
              <Input
                id="title"
                type="text"
                placeholder="Наприклад: Ремонт крана на кухні"
                bind:value={title}
                maxlength={TITLE_MAX}
                aria-invalid={!!titleError}
                aria-describedby={titleError ? 'title-error' : 'title-hint'}
                class={cn(titleError && 'border-destructive')}
                onblur={() => {
                  touchedTitle = true
                }}
              />
              {#if titleError}
                <Field.Description id="title-error" class="text-destructive">
                  {titleError}
                </Field.Description>
              {:else}
                <Field.Description id="title-hint">
                  Коротко і конкретно — майстри шукають по ключових словах
                </Field.Description>
              {/if}
            </Field.Field>

            <!-- ══ 4. Опис ════════════════════════════ -->
            <Field.Field>
              <div class="flex items-baseline justify-between">
                <Field.Label for="description">Опис</Field.Label>
                <span
                  class={cn(
                    'text-[11px] tabular-nums transition-colors',
                    descTrim.length > DESC_MAX * 0.9
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                  )}
                  aria-live="polite"
                >
                  {descTrim.length}/{DESC_MAX}
                </span>
              </div>
              <Textarea
                id="description"
                placeholder="Опишіть проблему детально: що сталось, які матеріали є, чи є доступ, важливі деталі..."
                bind:value={description}
                maxlength={DESC_MAX}
                rows={5}
                aria-invalid={!!descError}
                aria-describedby={descError ? 'desc-error' : 'desc-hint'}
                class={cn('resize-none', descError && 'border-destructive')}
                onblur={() => {
                  touchedDesc = true
                }}
              />
              {#if descError}
                <Field.Description id="desc-error" class="text-destructive">
                  {descError}
                </Field.Description>
              {:else}
                <Field.Description id="desc-hint">
                  Мінімум {DESC_MIN} символів. Чим детальніше — тим точніші пропозиції.
                </Field.Description>
              {/if}
            </Field.Field>

            <!-- ══ 5. Коли потрібно (опц.) ═══════════ -->
            <Field.Field>
              <Field.Label>
                Коли потрібно
                <span
                  class="text-[10px] font-normal uppercase tracking-wide ml-1.5 text-muted-foreground"
                >
                  Опц.
                </span>
              </Field.Label>

              <!-- Пресети -->
              <div
                class="flex flex-wrap gap-1.5"
                role="group"
                aria-label="Пресети часу"
              >
                {#each TIME_PRESETS as p (p.key)}
                  <button
                    type="button"
                    onclick={() => selectPreset(p.key)}
                    aria-pressed={timePreset === p.key}
                    class="time-chip"
                    class:time-chip-active={timePreset === p.key}
                  >
                    {p.label}
                  </button>
                {/each}
              </div>

              <!-- Діапазон дат: від → до -->
              <div class="flex items-center gap-2 mt-2">
                <Popover.Root bind:open={dateFromOpen}>
                  <Popover.Trigger>
                    {#snippet child({ props })}
                      <button
                        {...props}
                        type="button"
                        aria-label={dateFromLabel
                          ? `Від: ${dateFromLabel}`
                          : 'Оберіть дату від'}
                        class={cn(
                          'date-range-btn flex-1',
                          customDateFrom && 'date-range-btn-active',
                        )}
                        onclick={() => {
                          timePreset = 'custom'
                          dateFromOpen = true
                        }}
                      >
                        <CalendarIcon
                          class="size-3.5 shrink-0 opacity-50"
                          aria-hidden="true"
                        />
                        <span class="truncate">{dateFromLabel || 'Від'}</span>
                      </button>
                    {/snippet}
                  </Popover.Trigger>
                  <Popover.Content
                    class="w-auto p-0"
                    align="start"
                    sideOffset={6}
                  >
                    <Calendar
                      type="single"
                      bind:value={customDateFrom}
                      minValue={todayDate}
                      onValueChange={(v) => {
                        if (v) {
                          timePreset = 'custom'
                          if (customDateTo && v.compare(customDateTo) > 0)
                            customDateTo = undefined
                          dateFromOpen = false
                        }
                      }}
                    />
                  </Popover.Content>
                </Popover.Root>

                <span class="text-sm text-muted-foreground shrink-0">—</span>

                <Popover.Root bind:open={dateToOpen}>
                  <Popover.Trigger>
                    {#snippet child({ props })}
                      <button
                        {...props}
                        type="button"
                        aria-label={dateToLabel
                          ? `До: ${dateToLabel}`
                          : 'Оберіть дату до'}
                        class={cn(
                          'date-range-btn flex-1',
                          customDateTo && 'date-range-btn-active',
                        )}
                        onclick={() => {
                          timePreset = 'custom'
                          dateToOpen = true
                        }}
                      >
                        <CalendarIcon
                          class="size-3.5 shrink-0 opacity-50"
                          aria-hidden="true"
                        />
                        <span class="truncate">{dateToLabel || 'До'}</span>
                      </button>
                    {/snippet}
                  </Popover.Trigger>
                  <Popover.Content
                    class="w-auto p-0"
                    align="start"
                    sideOffset={6}
                  >
                    <Calendar
                      type="single"
                      bind:value={customDateTo}
                      minValue={customDateFrom ?? todayDate}
                      onValueChange={(v) => {
                        if (v) {
                          timePreset = 'custom'
                          dateToOpen = false
                        }
                      }}
                    />
                  </Popover.Content>
                </Popover.Root>
              </div>
            </Field.Field>

            <!-- ══ 6. Бюджет (опц.) ══════════════════ -->
            <Field.Field>
              <Field.Label for="budget">
                Бюджет, ₴
                <span
                  class="text-[10px] font-normal uppercase tracking-wide ml-1.5 text-muted-foreground"
                >
                  Опц.
                </span>
              </Field.Label>
              <Input
                id="budget"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                placeholder="Наприклад: 1500"
                bind:value={budget}
                aria-invalid={!!budgetError}
                aria-describedby={budgetError ? 'budget-error' : 'budget-hint'}
                class={cn('tabular-nums', budgetError && 'border-destructive')}
                onblur={() => {
                  touchedBudget = true
                }}
              />
              {#if budgetError}
                <Field.Description id="budget-error" class="text-destructive">
                  {budgetError}
                </Field.Description>
              {:else}
                <Field.Description id="budget-hint">
                  Вкажіть очікувану суму або залиште порожнім
                </Field.Description>
              {/if}
            </Field.Field>

            <!-- Server error -->
            {#if serverError}
              <div
                class="text-sm p-3 rounded-lg bg-destructive/8 text-destructive border border-destructive/20"
                role="alert"
                aria-live="assertive"
              >
                {serverError}
              </div>
            {/if}

            <!-- Submit -->
            <Button
              type="submit"
              disabled={loading || !!successMessage}
              class="w-full h-11 mt-2 font-semibold"
            >
              {#if successMessage}
                <CircleCheckBigIcon class="size-4 mr-2" />
                {successMessage}
              {:else if loading}
                <Spinner />
                Створюємо...
              {:else}
                Створити замовлення
              {/if}
            </Button>
          </Field.Group>
        </form>
      </Card.Content>
    </Card.Root>
  </div>
</div>

<style>
  .time-chip {
    display: inline-flex;
    align-items: center;
    padding: 0.4375rem 0.875rem;
    border-radius: 9999px;
    font-size: 0.8125rem;
    font-weight: 500;
    background-color: transparent;
    color: var(--foreground);
    border: 1px solid var(--border);
    cursor: pointer;
    transition:
      background-color 120ms ease,
      border-color 120ms ease,
      opacity 120ms ease;
    white-space: nowrap;
    outline-offset: 2px;
  }
  .time-chip:hover {
    background-color: var(--muted);
  }
  .time-chip:focus-visible {
    outline: 2px solid var(--ring);
  }
  .time-chip-active {
    background-color: var(--foreground);
    color: var(--background);
    border-color: var(--foreground);
  }
  .time-chip-active:hover {
    opacity: 0.9;
  }

  .date-range-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.4375rem 0.75rem;
    border-radius: var(--radius);
    font-size: 0.8125rem;
    font-weight: 400;
    background-color: transparent;
    color: var(--muted-foreground);
    border: 1px solid var(--border);
    cursor: pointer;
    transition:
      background-color 120ms ease,
      border-color 120ms ease,
      color 120ms ease;
    white-space: nowrap;
    outline-offset: 2px;
    min-width: 0;
  }
  .date-range-btn:hover {
    background-color: var(--muted);
    color: var(--foreground);
  }
  .date-range-btn:focus-visible {
    outline: 2px solid var(--ring);
  }
  .date-range-btn-active {
    color: var(--foreground);
    border-color: var(--foreground);
  }
</style>
