<!-- src/lib/components/jobs/job-form.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { onDestroy } from 'svelte'
  import { fade } from 'svelte/transition'
  import {
    Save,
    AlertCircle,
    ChevronDown,
    Check,
    Search,
    X,
    MapPin,
    Tag,
    Wallet,
    Clock,
    Globe,
    Sparkles,
  } from 'lucide-svelte'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Button } from '$lib/components/ui/button'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { Spinner } from '../ui/spinner'

  interface Props {
    initial?: {
      id: string
      title: string
      description: string
      category: string
      subcategory: string | null
      tags: string[]
      budgetType: string
      budgetMinCents: number | null
      budgetMaxCents: number | null
      deliveryDays: number | null
      type: string
      city: string | null
    }
  }

  let { initial }: Props = $props()

  // ═══════════════════════════════════════════════════════════
  // Types
  // ═══════════════════════════════════════════════════════════

  interface CategoryOption {
    id: string
    name: string
    slug: string
  }

  interface CityOption {
    id: string
    name: string
  }

  // ═══════════════════════════════════════════════════════════
  // Module-level cache (переживає mount/unmount)
  // ═══════════════════════════════════════════════════════════

  let categoriesCache: CategoryOption[] | null = null
  let citiesCache: CityOption[] | null = null
  let categoriesPromise: Promise<CategoryOption[]> | null = null
  let citiesPromise: Promise<CityOption[]> | null = null

  // ═══════════════════════════════════════════════════════════
  // Constants
  // ═══════════════════════════════════════════════════════════

  const FETCH_TIMEOUT_MS = 8_000
  const SUBMIT_TIMEOUT_MS = 20_000

  const TITLE_MIN = 10
  const TITLE_MAX = 200
  const DESC_MIN = 50
  const DESC_MAX = 10_000
  const BUDGET_MIN = 100
  const BUDGET_MAX = 1_000_000
  const TAGS_MAX = 10
  const TAG_MAX_LENGTH = 30
  const DELIVERY_MIN = 1
  const DELIVERY_MAX = 180

  const BUDGET_TYPES = [
    { value: 'FIXED', label: 'Фіксований' },
    { value: 'RANGE', label: 'Діапазон' },
    { value: 'NEGOTIABLE', label: 'Договірний' },
  ] as const

  const TYPE_OPTIONS = [
    { value: 'ANY', label: 'Будь-який', icon: Sparkles },
    { value: 'ONLINE', label: 'Онлайн', icon: Globe },
    { value: 'OFFLINE', label: 'Офлайн', icon: MapPin },
    { value: 'VISIT', label: 'Виїзд', icon: MapPin },
  ] as const

  // ═══════════════════════════════════════════════════════════
  // State
  // ═══════════════════════════════════════════════════════════

  let title = $derived(initial?.title ?? '')
  let description = $state(initial?.description ?? '')
  let category = $state(initial?.category ?? '')
  let subcategory = $state(initial?.subcategory ?? '')
  let tagsInput = $state((initial?.tags ?? []).join(', '))
  let type = $state(initial?.type ?? 'ANY')
  let city = $state(initial?.city ?? '')
  let deliveryDays = $state(
    initial?.deliveryDays ? String(initial.deliveryDays) : '',
  )
  let budgetType = $state(initial?.budgetType ?? 'FIXED')
  let budgetMaxUah = $state(
    initial?.budgetMaxCents ? String(initial.budgetMaxCents / 100) : '',
  )
  let budgetMinUah = $state(
    initial?.budgetMinCents ? String(initial.budgetMinCents / 100) : '',
  )

  let submitting = $state(false)
  let error = $state('')

  // Dropdowns
  let categories = $state<CategoryOption[]>(categoriesCache ?? [])
  let cities = $state<CityOption[]>(citiesCache ?? [])
  let categoriesLoading = $state(false)
  let citiesLoading = $state(false)
  let categoriesError = $state(false)
  let citiesError = $state(false)
  let categoriesLoaded = $state(!!categoriesCache)
  let citiesLoaded = $state(!!citiesCache)

  let categorySearch = $state('')
  let citySearch = $state('')

  let categoriesAbort: AbortController | null = null
  let citiesAbort: AbortController | null = null
  let submitAbort: AbortController | null = null

  // ═══════════════════════════════════════════════════════════
  // Derived
  // ═══════════════════════════════════════════════════════════

  const tags = $derived(
    tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length <= TAG_MAX_LENGTH)
      .slice(0, TAGS_MAX),
  )

  const titleTrimmed = $derived(title.trim())
  const descriptionTrimmed = $derived(description.trim())

  const titleValid = $derived(
    titleTrimmed.length >= TITLE_MIN && titleTrimmed.length <= TITLE_MAX,
  )
  const descValid = $derived(
    descriptionTrimmed.length >= DESC_MIN &&
      descriptionTrimmed.length <= DESC_MAX,
  )
  const categoryValid = $derived(!!category.trim())

  const budgetValid = $derived.by(() => {
    if (budgetType === 'NEGOTIABLE') return true
    if (budgetType === 'FIXED') {
      const v = Number(budgetMaxUah)
      return Number.isFinite(v) && v >= BUDGET_MIN && v <= BUDGET_MAX
    }
    if (budgetType === 'RANGE') {
      const min = Number(budgetMinUah)
      const max = Number(budgetMaxUah)
      return (
        Number.isFinite(min) &&
        Number.isFinite(max) &&
        min >= BUDGET_MIN &&
        max <= BUDGET_MAX &&
        min < max
      )
    }
    return false
  })

  const formValid = $derived(
    titleValid && descValid && categoryValid && budgetValid,
  )

  const typeLabel = $derived(
    TYPE_OPTIONS.find((o) => o.value === type)?.label ?? 'Будь-який',
  )

  const categoryLabel = $derived.by(() => {
    if (!category) return 'Виберіть категорію'
    const found = categories.find((c) => c.slug === category)
    return found?.name ?? category
  })

  const filteredCategories = $derived.by(() => {
    const q = categorySearch.trim().toLowerCase()
    if (!q) return categories
    return categories.filter((c) => c.name.toLowerCase().includes(q))
  })

  const filteredCities = $derived.by(() => {
    const q = citySearch.trim().toLowerCase()
    if (!q) return cities
    return cities.filter((c) => c.name.toLowerCase().includes(q))
  })

  const titleCharsLeft = $derived(TITLE_MAX - title.length)
  const descCharsLeft = $derived(DESC_MAX - description.length)

  // ═══════════════════════════════════════════════════════════
  // Lazy data loading
  // ═══════════════════════════════════════════════════════════

  async function fetchCategoriesData(): Promise<CategoryOption[]> {
    if (categoriesCache) return categoriesCache
    if (categoriesPromise) return categoriesPromise

    categoriesPromise = (async () => {
      if (categoriesAbort) categoriesAbort.abort()
      categoriesAbort = new AbortController()
      const timeoutId = setTimeout(
        () => categoriesAbort?.abort(),
        FETCH_TIMEOUT_MS,
      )

      try {
        const res = await fetch('/api/categories', {
          signal: categoriesAbort.signal,
        })
        clearTimeout(timeoutId)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const json = await res.json()
        const raw = Array.isArray(json) ? json : (json.categories ?? [])

        const items: CategoryOption[] = raw
          .map((c: any, idx: number) => {
            const name = String(c?.name ?? c?.title ?? '').trim()
            const slug = String(c?.slug ?? c?.id ?? '').trim()
            const id = String(c?.id ?? slug ?? `cat-${idx}`).trim()
            return { id, name, slug }
          })
          .filter((c: CategoryOption) => c.name && c.slug)

        const seen = new Set<string>()
        const deduped = items.filter((c) => {
          if (seen.has(c.slug)) return false
          seen.add(c.slug)
          return true
        })

        categoriesCache = deduped
        return deduped
      } catch (err) {
        categoriesPromise = null
        throw err
      } finally {
        clearTimeout(timeoutId)
      }
    })()

    return categoriesPromise
  }

  async function fetchCitiesData(): Promise<CityOption[]> {
    if (citiesCache) return citiesCache
    if (citiesPromise) return citiesPromise

    citiesPromise = (async () => {
      if (citiesAbort) citiesAbort.abort()
      citiesAbort = new AbortController()
      const timeoutId = setTimeout(() => citiesAbort?.abort(), FETCH_TIMEOUT_MS)

      try {
        const res = await fetch('/api/cities', {
          signal: citiesAbort.signal,
        })
        clearTimeout(timeoutId)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const json = await res.json()
        const raw = Array.isArray(json) ? json : (json.cities ?? [])

        const items: CityOption[] = raw
          .map((c: any, idx: number) => {
            const name =
              typeof c === 'string'
                ? c.trim()
                : String(c?.name ?? c?.title ?? '').trim()
            const id = String(c?.id ?? name ?? `city-${idx}`).trim()
            return { id, name }
          })
          .filter((c: CityOption) => c.name)

        const seen = new Set<string>()
        const deduped = items.filter((c) => {
          if (seen.has(c.name)) return false
          seen.add(c.name)
          return true
        })

        citiesCache = deduped
        return deduped
      } catch (err) {
        citiesPromise = null
        throw err
      } finally {
        clearTimeout(timeoutId)
      }
    })()

    return citiesPromise
  }

  async function ensureCategoriesLoaded() {
    if (categoriesLoaded || categoriesLoading) return
    categoriesLoading = true
    categoriesError = false
    try {
      const items = await fetchCategoriesData()
      categories = items
      categoriesLoaded = true
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[categories] failed:', err)
        categoriesError = true
      }
    } finally {
      categoriesLoading = false
    }
  }

  async function ensureCitiesLoaded() {
    if (citiesLoaded || citiesLoading) return
    citiesLoading = true
    citiesError = false
    try {
      const items = await fetchCitiesData()
      cities = items
      citiesLoaded = true
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[cities] failed:', err)
        citiesError = true
      }
    } finally {
      citiesLoading = false
    }
  }

  function onCategoryDropdownChange(open: boolean) {
    if (open) ensureCategoriesLoaded()
    else categorySearch = ''
  }

  function onCityDropdownChange(open: boolean) {
    if (open) ensureCitiesLoaded()
    else citySearch = ''
  }

  function selectCategory(slug: string) {
    category = slug
    categorySearch = ''
  }

  function selectCity(name: string) {
    city = name
    citySearch = ''
  }

  // ═══════════════════════════════════════════════════════════
  // Numeric only inputs
  // ═══════════════════════════════════════════════════════════

  function sanitizeDigits(value: string, maxLen: number): string {
    return value.replace(/\D/g, '').slice(0, maxLen)
  }

  function onBudgetMinInput(e: Event) {
    const target = e.currentTarget as HTMLInputElement
    const clean = sanitizeDigits(target.value, 7)
    if (clean !== target.value) target.value = clean
    budgetMinUah = clean
  }

  function onBudgetMaxInput(e: Event) {
    const target = e.currentTarget as HTMLInputElement
    const clean = sanitizeDigits(target.value, 7)
    if (clean !== target.value) target.value = clean
    budgetMaxUah = clean
  }

  function onDeliveryDaysInput(e: Event) {
    const target = e.currentTarget as HTMLInputElement
    const clean = sanitizeDigits(target.value, 3)
    if (clean !== target.value) target.value = clean
    deliveryDays = clean
  }

  function onNumericKeyDown(e: KeyboardEvent) {
    const allowed = [
      'Backspace',
      'Delete',
      'Tab',
      'Escape',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ]
    if (allowed.includes(e.key)) return
    if (
      (e.ctrlKey || e.metaKey) &&
      ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())
    )
      return
    if (!/^[0-9]$/.test(e.key)) e.preventDefault()
  }

  // ═══════════════════════════════════════════════════════════
  // Submit
  // ═══════════════════════════════════════════════════════════

  async function submit() {
    if (submitting) return
    error = ''

    if (!titleValid) {
      error = `Назва: від ${TITLE_MIN} до ${TITLE_MAX} символів`
      return
    }
    if (!descValid) {
      error = `Опис: від ${DESC_MIN} до ${DESC_MAX} символів`
      return
    }
    if (!categoryValid) {
      error = 'Виберіть категорію'
      return
    }
    if (!budgetValid) {
      if (budgetType === 'FIXED') {
        error = `Бюджет: від ${BUDGET_MIN} до ${BUDGET_MAX.toLocaleString('uk-UA')} грн`
      } else if (budgetType === 'RANGE') {
        error =
          'Невірний діапазон бюджету (мін. 100 ₴, "від" має бути менше "до")'
      }
      return
    }

    submitting = true

    if (submitAbort) submitAbort.abort()
    submitAbort = new AbortController()
    const timeoutId = setTimeout(() => submitAbort?.abort(), SUBMIT_TIMEOUT_MS)

    try {
      const body: Record<string, unknown> = {
        title: titleTrimmed,
        description: descriptionTrimmed,
        category: category.trim(),
        subcategory: subcategory.trim() || null,
        tags,
        type,
        city: city.trim() || null,
        deliveryDays: deliveryDays ? Number(deliveryDays) : null,
        budgetType,
      }

      if (budgetType === 'FIXED') {
        body.budgetMaxUah = Number(budgetMaxUah)
      } else if (budgetType === 'RANGE') {
        body.budgetMinUah = Number(budgetMinUah)
        body.budgetMaxUah = Number(budgetMaxUah)
      }

      const url = initial ? `/api/jobs/${initial.id}` : '/api/jobs'
      const method = initial ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: submitAbort.signal,
      })

      clearTimeout(timeoutId)

      if (res.status === 429) {
        error = 'Забагато запитів. Спробуйте за хвилину.'
        return
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message ?? `Помилка ${res.status}`)
      }

      const json = await res.json()
      goto(`/jobs/${json.job.id}`)
    } catch (err) {
      clearTimeout(timeoutId)
      if ((err as Error).name === 'AbortError') {
        error = 'Запит зайняв забагато часу'
      } else {
        error = err instanceof Error ? err.message : 'Помилка'
      }
    } finally {
      submitting = false
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Cleanup
  // ═══════════════════════════════════════════════════════════

  onDestroy(() => {
    if (categoriesAbort) categoriesAbort.abort()
    if (citiesAbort) citiesAbort.abort()
    if (submitAbort) submitAbort.abort()
  })
</script>

<div class="ios-form-wrap max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
  <!-- ─── Header ─── -->
  <header class="mb-6">
    <h1
      class="text-[26px] sm:text-[30px] font-bold tracking-[-0.02em] leading-tight"
      style="color: var(--foreground)"
    >
      {initial ? 'Редагувати заявку' : 'Опублікувати заявку'}
    </h1>
    <p
      class="text-[14px] mt-1.5 leading-snug"
      style="color: var(--muted-foreground)"
    >
      Опишіть задачу — фрілансери надішлють вам відгуки
    </p>
  </header>

  <!-- ─── Card: Основне ─── -->
  <section class="ios-card">
    <div class="ios-card-header">
      <Sparkles class="size-3.5 opacity-60" />
      Основне
    </div>

    <div class="ios-card-body space-y-4">
      <!-- Title -->
      <div>
        <label for="job-title" class="ios-label">Назва</label>
        <div class="ios-input-wrap">
          <Input
            id="job-title"
            bind:value={title}
            placeholder="Шукаю майстра для встановлення кондиціонера"
            maxlength={TITLE_MAX}
            autocomplete="off"
            class="h-11 rounded-xl pr-10"
          />
          {#if title}
            <button
              type="button"
              class="ios-clear-btn"
              onclick={() => (title = '')}
              aria-label="Очистити назву"
            >
              <X class="size-3.5" />
            </button>
          {/if}
        </div>
        <p class="ios-hint">
          {#if title.length > 0 && !titleValid}
            <span style="color: var(--destructive)">
              Мінімум {TITLE_MIN} символів
            </span>
          {:else}
            {title.length}/{TITLE_MAX}
          {/if}
        </p>
      </div>

      <!-- Description -->
      <div>
        <label for="job-desc" class="ios-label">Опис задачі</label>
        <Textarea
          id="job-desc"
          bind:value={description}
          rows={6}
          placeholder="Що саме потрібно зробити, які особливі вимоги, що ви очікуєте від виконавця…"
          maxlength={DESC_MAX}
          class="rounded-xl resize-none"
        />
        <p class="ios-hint">
          {#if description.length > 0 && !descValid}
            <span style="color: var(--destructive)">
              Мінімум {DESC_MIN} символів (зараз {description.length})
            </span>
          {:else}
            {description.length}/{DESC_MAX}
          {/if}
        </p>
      </div>
    </div>
  </section>

  <!-- ─── Card: Категорія ─── -->
  <section class="ios-card">
    <div class="ios-card-header">
      <Tag class="size-3.5 opacity-60" />
      Категорія
    </div>

    <div class="ios-card-body space-y-4">
      <div>
        <label class="ios-label" for="job-cat">Категорія</label>
        <DropdownMenu.Root onOpenChange={onCategoryDropdownChange}>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                id="job-cat"
                type="button"
                class="ios-select"
                class:ios-select-empty={!category}
              >
                <span class="truncate">{categoryLabel}</span>
                <ChevronDown class="size-4 shrink-0 opacity-50" />
              </button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            class="w-72 rounded-2xl p-0 overflow-hidden"
            sideOffset={6}
          >
            {#if categoriesLoading}
              <div class="flex items-center justify-center py-8">
                <Spinner style="color: var(--muted-foreground)" />
              </div>
            {:else if categoriesError}
              <div class="flex flex-col items-center gap-2 py-8 px-4">
                <AlertCircle class="size-5" style="color: var(--destructive)" />
                <p
                  class="text-xs text-center"
                  style="color: var(--muted-foreground)"
                >
                  Не вдалось завантажити
                </p>
                <button
                  type="button"
                  onclick={ensureCategoriesLoaded}
                  class="text-xs font-medium cursor-pointer hover:underline"
                  style="color: var(--primary)"
                >
                  Спробувати ще раз
                </button>
              </div>
            {:else if categories.length === 0}
              <p
                class="text-xs text-center py-6"
                style="color: var(--muted-foreground)"
              >
                Немає категорій
              </p>
            {:else}
              <div class="dropdown-search-wrap">
                <Search class="dropdown-search-icon size-3.5" />
                <input
                  type="text"
                  bind:value={categorySearch}
                  placeholder="Пошук категорії"
                  autocomplete="off"
                  spellcheck="false"
                  class="dropdown-search-input"
                  onkeydown={(e) => e.stopPropagation()}
                />
              </div>

              <div class="max-h-72 overflow-y-auto py-1">
                {#if filteredCategories.length === 0}
                  <p
                    class="text-xs text-center py-4"
                    style="color: var(--muted-foreground)"
                  >
                    Нічого не знайдено
                  </p>
                {:else}
                  {#each filteredCategories as cat, i (cat.slug || cat.id || i)}
                    <DropdownMenu.Item
                      class="cursor-pointer text-sm rounded-lg mx-1 flex items-center justify-between"
                      onclick={() => selectCategory(cat.slug)}
                    >
                      <span class="truncate">{cat.name}</span>
                      {#if category === cat.slug}
                        <Check
                          class="size-3.5 shrink-0"
                          style="color: var(--primary)"
                        />
                      {/if}
                    </DropdownMenu.Item>
                  {/each}
                {/if}
              </div>
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      <!-- Subcategory -->
      <div>
        <label class="ios-label" for="job-subcat">Підкатегорія (опційно)</label>
        <div class="ios-input-wrap">
          <Input
            id="job-subcat"
            bind:value={subcategory}
            placeholder="Встановлення"
            maxlength={50}
            class="h-11 rounded-xl pr-10"
          />
          {#if subcategory}
            <button
              type="button"
              class="ios-clear-btn"
              onclick={() => (subcategory = '')}
              aria-label="Очистити підкатегорію"
            >
              <X class="size-3.5" />
            </button>
          {/if}
        </div>
      </div>
    </div>
  </section>

  <!-- ─── Card: Бюджет ─── -->
  <section class="ios-card">
    <div class="ios-card-header">
      <Wallet class="size-3.5 opacity-60" />
      Бюджет
    </div>

    <div class="ios-card-body space-y-4">
      <div>
        <span class="ios-label">Тип бюджету</span>
        <div class="flex gap-1.5 flex-wrap">
          {#each BUDGET_TYPES as opt (opt.value)}
            {@const isActive = budgetType === opt.value}
            <button
              type="button"
              onclick={() => (budgetType = opt.value)}
              class="ios-segment"
              class:ios-segment-active={isActive}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      {#if budgetType === 'FIXED'}
        <div>
          <label class="ios-label" for="budget-max">Сума, ₴</label>
          <Input
            id="budget-max"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            value={budgetMaxUah}
            oninput={onBudgetMaxInput}
            onkeydown={onNumericKeyDown}
            placeholder="2000"
            maxlength={7}
            autocomplete="off"
            class="h-11 rounded-xl tabular-nums text-[15px]"
          />
          <p class="ios-hint">
            Від {BUDGET_MIN} до {BUDGET_MAX.toLocaleString('uk-UA')} грн
          </p>
        </div>
      {:else if budgetType === 'RANGE'}
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="ios-label" for="budget-min">Від, ₴</label>
            <Input
              id="budget-min"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              value={budgetMinUah}
              oninput={onBudgetMinInput}
              onkeydown={onNumericKeyDown}
              placeholder="500"
              maxlength={7}
              autocomplete="off"
              class="h-11 rounded-xl tabular-nums text-[15px]"
            />
          </div>
          <div>
            <label class="ios-label" for="budget-max-range">До, ₴</label>
            <Input
              id="budget-max-range"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              value={budgetMaxUah}
              oninput={onBudgetMaxInput}
              onkeydown={onNumericKeyDown}
              placeholder="2000"
              maxlength={7}
              autocomplete="off"
              class="h-11 rounded-xl tabular-nums text-[15px]"
            />
          </div>
        </div>
      {:else}
        <p
          class="text-[13px] leading-relaxed"
          style="color: var(--muted-foreground)"
        >
          Готові обговорити умови з фрілансером після отримання відгуків
        </p>
      {/if}
    </div>
  </section>

  <!-- ─── Card: Тип і місце ─── -->
  <section class="ios-card">
    <div class="ios-card-header">
      <MapPin class="size-3.5 opacity-60" />
      Тип і місце
    </div>

    <div class="ios-card-body space-y-4">
      <div>
        <span class="ios-label">Тип роботи</span>
        <div class="flex gap-1.5 flex-wrap">
          {#each TYPE_OPTIONS as opt (opt.value)}
            {@const isActive = type === opt.value}
            <button
              type="button"
              onclick={() => (type = opt.value)}
              class="ios-segment inline-flex items-center gap-1.5"
              class:ios-segment-active={isActive}
            >
              <opt.icon class="size-3.5" strokeWidth={2} />
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- City -->
      <div>
        <label class="ios-label" for="job-city">Місто (опційно)</label>
        <DropdownMenu.Root onOpenChange={onCityDropdownChange}>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                id="job-city"
                type="button"
                class="ios-select"
                class:ios-select-empty={!city}
              >
                <span class="truncate">{city || 'Виберіть місто'}</span>
                <ChevronDown class="size-4 shrink-0 opacity-50" />
              </button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            class="w-72 rounded-2xl p-0 overflow-hidden"
            sideOffset={6}
          >
            {#if citiesLoading}
              <div class="flex items-center justify-center py-8">
                <Spinner style="color: var(--muted-foreground)" />
              </div>
            {:else if citiesError}
              <div class="flex flex-col items-center gap-2 py-8 px-4">
                <AlertCircle class="size-5" style="color: var(--destructive)" />
                <p
                  class="text-xs text-center"
                  style="color: var(--muted-foreground)"
                >
                  Не вдалось завантажити
                </p>
                <button
                  type="button"
                  onclick={ensureCitiesLoaded}
                  class="text-xs font-medium cursor-pointer hover:underline"
                  style="color: var(--primary)"
                >
                  Спробувати ще раз
                </button>
              </div>
            {:else if cities.length === 0}
              <p
                class="text-xs text-center py-6"
                style="color: var(--muted-foreground)"
              >
                Немає міст
              </p>
            {:else}
              <div class="dropdown-search-wrap">
                <Search class="dropdown-search-icon size-3.5" />
                <input
                  type="text"
                  bind:value={citySearch}
                  placeholder="Пошук міста"
                  autocomplete="off"
                  spellcheck="false"
                  class="dropdown-search-input"
                  onkeydown={(e) => e.stopPropagation()}
                />
              </div>

              <div class="max-h-72 overflow-y-auto py-1">
                {#if city && !citySearch}
                  <DropdownMenu.Item
                    class="cursor-pointer text-sm rounded-lg mx-1"
                    onclick={() => selectCity('')}
                  >
                    <span style="color: var(--muted-foreground)">Без міста</span
                    >
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                {/if}

                {#if filteredCities.length === 0}
                  <p
                    class="text-xs text-center py-4"
                    style="color: var(--muted-foreground)"
                  >
                    Нічого не знайдено
                  </p>
                {:else}
                  {#each filteredCities as c, i (c.name || c.id || i)}
                    <DropdownMenu.Item
                      class="cursor-pointer text-sm rounded-lg mx-1 flex items-center justify-between"
                      onclick={() => selectCity(c.name)}
                    >
                      <span class="truncate">{c.name}</span>
                      {#if city === c.name}
                        <Check
                          class="size-3.5 shrink-0"
                          style="color: var(--primary)"
                        />
                      {/if}
                    </DropdownMenu.Item>
                  {/each}
                {/if}
              </div>
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>
  </section>

  <!-- ─── Card: Деталі ─── -->
  <section class="ios-card">
    <div class="ios-card-header">
      <Clock class="size-3.5 opacity-60" />
      Деталі
    </div>

    <div class="ios-card-body space-y-4">
      <!-- Delivery days -->
      <div>
        <label class="ios-label" for="delivery-days">
          Бажаний термін, днів (опційно)
        </label>
        <Input
          id="delivery-days"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          value={deliveryDays}
          oninput={onDeliveryDaysInput}
          onkeydown={onNumericKeyDown}
          placeholder="7"
          maxlength={3}
          autocomplete="off"
          class="h-11 rounded-xl tabular-nums text-[15px]"
        />
        <p class="ios-hint">Від {DELIVERY_MIN} до {DELIVERY_MAX} днів</p>
      </div>

      <!-- Tags -->
      <div>
        <label class="ios-label" for="job-tags">Теги (через кому)</label>
        <div class="ios-input-wrap">
          <Input
            id="job-tags"
            bind:value={tagsInput}
            placeholder="кондиціонер, монтаж, lg"
            maxlength={300}
            autocomplete="off"
            class="h-11 rounded-xl pr-10"
          />
          {#if tagsInput}
            <button
              type="button"
              class="ios-clear-btn"
              onclick={() => (tagsInput = '')}
              aria-label="Очистити теги"
            >
              <X class="size-3.5" />
            </button>
          {/if}
        </div>
        <p class="ios-hint">Максимум {TAGS_MAX} тегів</p>

        {#if tags.length > 0}
          <div class="flex flex-wrap gap-1.5 mt-2.5">
            {#each tags as tag, i (tag + i)}
              <span class="ios-tag-chip">#{tag}</span>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </section>

  <!-- ─── Error ─── -->
  {#if error}
    <div
      in:fade={{ duration: 150 }}
      class="flex items-start gap-2 p-3 rounded-2xl text-sm mb-4"
      style="background-color: color-mix(in oklch, var(--destructive) 8%, transparent);
             color: var(--destructive);
             border: 1px solid color-mix(in oklch, var(--destructive) 22%, transparent)"
      role="alert"
    >
      <AlertCircle class="size-4 shrink-0 mt-0.5" />
      <span class="leading-snug">{error}</span>
    </div>
  {/if}

  <!-- ─── Actions ─── -->
  <div class="flex justify-end gap-2 sticky bottom-0 py-3 ios-actions-bar">
    <Button
      variant="outline"
      onclick={() => history.back()}
      disabled={submitting}
      class="h-11 px-5 rounded-full cursor-pointer"
    >
      Скасувати
    </Button>
    <Button
      onclick={submit}
      disabled={submitting || !formValid}
      class="h-11 px-6 rounded-full font-semibold cursor-pointer disabled:cursor-not-allowed"
    >
      {#if submitting}
        <Spinner />
        {initial ? 'Збереження…' : 'Публікація…'}
      {:else}
        <Save class="size-4 mr-2" strokeWidth={2.5} />
        {initial ? 'Зберегти зміни' : 'Опублікувати'}
      {/if}
    </Button>
  </div>
</div>

<style>
  /* ─── Card ─── */
  :global(.ios-card) {
    background-color: var(--card, #ffffff);
    border-radius: 16px;
    border: 1px solid rgba(0, 0, 0, 0.14);
    overflow: hidden;
    margin-bottom: 12px;
  }
  @media (prefers-color-scheme: dark) {
    :global(.ios-card) {
      border-color: rgba(255, 255, 255, 0.12);
    }
  }

  :global(.ios-card-header) {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 20px;
    background-color: #f5f5f7;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground);
  }
  @media (prefers-color-scheme: dark) {
    :global(.ios-card-header) {
      background-color: color-mix(in srgb, var(--muted) 50%, transparent);
      border-bottom-color: rgba(255, 255, 255, 0.07);
    }
  }

  :global(.ios-card-body) {
    padding: 18px 20px;
  }

  /* ─── Label ─── */
  :global(.ios-label) {
    display: block;
    font-size: 12.5px;
    font-weight: 600;
    margin-bottom: 7px;
    color: var(--foreground);
    letter-spacing: -0.005em;
  }

  /* ─── Input wrap (для крестика) ─── */
  :global(.ios-input-wrap) {
    position: relative;
  }

  /* ─── Clear button ─── */
  :global(.ios-clear-btn) {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background-color: rgba(0, 0, 0, 0.1);
    color: var(--muted-foreground);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: none;
    transition:
      background-color 120ms ease,
      transform 100ms ease;
    z-index: 10;
  }
  :global(.ios-clear-btn:hover) {
    background-color: rgba(0, 0, 0, 0.18);
  }
  :global(.ios-clear-btn:active) {
    transform: translateY(-50%) scale(0.92);
  }
  @media (prefers-color-scheme: dark) {
    :global(.ios-clear-btn) {
      background-color: rgba(255, 255, 255, 0.12);
    }
    :global(.ios-clear-btn:hover) {
      background-color: rgba(255, 255, 255, 0.2);
    }
  }

  /* ─── Hint ─── */
  :global(.ios-hint) {
    font-size: 11px;
    margin-top: 6px;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }

  /* ─── Select (dropdown trigger) ─── */
  :global(.ios-select) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    height: 44px;
    padding: 0 14px;
    border-radius: 12px;
    background-color: color-mix(in srgb, var(--foreground) 5%, transparent);
    border: 1px solid transparent;
    color: var(--foreground);
    font-size: 14.5px;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      border-color 120ms ease;
    text-align: left;
  }
  :global(.ios-select:hover) {
    background-color: color-mix(in srgb, var(--foreground) 8%, transparent);
  }
  :global(.ios-select:focus-visible) {
    outline: none;
    border-color: color-mix(in srgb, var(--foreground) 25%, transparent);
  }
  :global(.ios-select-empty) {
    color: var(--muted-foreground);
  }

  /* ─── Segmented control ─── */
  :global(.ios-segment) {
    height: 34px;
    padding: 0 13px;
    border-radius: 17px;
    background-color: color-mix(in srgb, var(--foreground) 6%, transparent);
    color: var(--foreground);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      transform 100ms ease;
    border: none;
    white-space: nowrap;
  }
  :global(.ios-segment:hover) {
    background-color: color-mix(in srgb, var(--foreground) 10%, transparent);
  }
  :global(.ios-segment:active) {
    transform: scale(0.97);
  }
  :global(.ios-segment-active) {
    background-color: var(--foreground) !important;
    color: var(--background) !important;
  }

  /* ─── Tag chip ─── */
  :global(.ios-tag-chip) {
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: 8px;
    font-size: 11.5px;
    font-weight: 500;
    background-color: rgba(0, 122, 255, 0.1);
    color: #007aff;
    line-height: 1.2;
  }
  @media (prefers-color-scheme: dark) {
    :global(.ios-tag-chip) {
      background-color: rgba(0, 122, 255, 0.18);
      color: #5ea7ff;
    }
  }

  /* ─── Dropdown search ─── */
  :global(.dropdown-search-wrap) {
    position: relative;
    padding: 8px;
    border-bottom: 1px solid var(--border);
  }
  :global(.dropdown-search-icon) {
    position: absolute;
    left: 18px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted-foreground);
    pointer-events: none;
  }
  :global(.dropdown-search-input) {
    width: 100%;
    height: 36px;
    padding: 0 12px 0 32px;
    border-radius: 12px;
    background-color: color-mix(in srgb, var(--foreground) 5%, transparent);
    color: var(--foreground);
    font-size: 13px;
    border: none;
    outline: none;
  }
  :global(.dropdown-search-input::placeholder) {
    color: var(--muted-foreground);
  }
  :global(.dropdown-search-input:focus) {
    background-color: color-mix(in srgb, var(--foreground) 8%, transparent);
  }

  /* ─── Sticky actions bar ─── */
  :global(.ios-actions-bar) {
    background: linear-gradient(to top, var(--background) 70%, transparent);
  }
</style>
