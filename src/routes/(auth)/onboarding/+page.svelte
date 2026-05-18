<!-- src/routes/(auth)/onboarding/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { fly } from 'svelte/transition'
  import { Button } from '$lib/components/ui/button'
  import { Spinner } from '$lib/components/ui/spinner'
  import AvatarUploader from '$lib/components/avatar-uploader.svelte'
  import UsernameInput from '$lib/components/username-input.svelte'
  import PortfolioUploader from '$lib/components/portfolio-uploader.svelte'
  import * as Field from '$lib/components/ui/field'
  import * as Popover from '$lib/components/ui/popover'
  import * as Command from '$lib/components/ui/command'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { cn } from '$lib/utils'
  import { tick } from 'svelte'
  import toast from 'svelte-hot-french-toast'
  import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left'
  import ArrowRightIcon from '@lucide/svelte/icons/arrow-right'
  import CheckIcon from '@lucide/svelte/icons/check'
  import XIcon from '@lucide/svelte/icons/x'
  import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down'
  import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
  import CircleCheckBigIcon from '@lucide/svelte/icons/circle-check-big'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  const TOTAL_STEPS = 3
  const DESC_MIN = 50
  const DESC_MAX = 2000
  const MAX_CATS = 1

  let step = $state(1)

  let avatarUrl = $state(data.user.avatar ?? '')
  let avatarPublicId = $state(data.user.avatarPublicId ?? '')
  let avatarUploading = $state(false)

  let name = $state(data.user.name ?? '')
  let username = $state(data.user.username ?? '')
  let usernameValid = $state<boolean | null>(data.user.username ? true : null)
  let phone = $state(data.user.phone ?? '')

  let city = $state(data.user.city ?? '')
  let cityOpen = $state(false)
  let cityTriggerRef = $state<HTMLButtonElement>(null!)

  let categories = $state<string[]>(data.user.masterProfile?.categories ?? [])
  let description = $state(data.user.masterProfile?.description ?? '')

  let portfolioImages = $state<string[]>(
    data.user.masterProfile?.portfolioImages ?? [],
  )
  let portfolioImagesPublicIds = $state<string[]>(
    data.user.masterProfile?.portfolioImagesPublicIds ?? [],
  )
  let portfolioUploading = $state(false)

  let submitting = $state(false)
  let success = $state(false)

  const isEdit = $derived(
    data.user.masterProfile?.verificationStatus !== 'NONE' &&
      data.user.masterProfile?.verificationStatus !== undefined,
  )
  const wasRejected = $derived(
    data.user.masterProfile?.verificationStatus === 'REJECTED',
  )

  const cityName = $derived(
    data.cities.find((c) => c.slug === city)?.name ?? '',
  )
  const descTrim = $derived(description.trim())

  const step1Valid = $derived(
    name.trim().length >= 2 && usernameValid === true && !!city,
  )
  const step2Valid = $derived(
    categories.length >= 1 && categories.length <= MAX_CATS,
  )
  const step3Valid = $derived(
    descTrim.length >= DESC_MIN && descTrim.length <= DESC_MAX,
  )
  const canNext = $derived(
    step === 1 ? step1Valid : step === 2 ? step2Valid : step3Valid,
  )

  function next() {
    if (!canNext) {
      if (step === 1) {
        if (name.trim().length < 2) toast.error('Введіть імʼя (мін. 2 символи)')
        else if (usernameValid !== true) toast.error('Перевірте username')
        else if (!city) toast.error('Оберіть місто')
      } else if (step === 2) {
        toast.error('Оберіть хоча б одну категорію')
      } else {
        toast.error(`Опис: мінімум ${DESC_MIN} символів`)
      }
      return
    }
    if (step < TOTAL_STEPS) {
      step += 1
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      submit()
    }
  }

  function back() {
    if (step > 1) {
      step -= 1
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  function leave() {
    goto('/dashboard')
  }

  function toggleCategory(slug: string) {
    if (categories.includes(slug)) {
      categories = categories.filter((s) => s !== slug)
    } else {
      if (categories.length >= MAX_CATS) {
        toast.error(`Максимум ${MAX_CATS} категорій`)
        return
      }
      categories = [...categories, slug]
    }
  }

  function selectCity(slug: string) {
    city = slug
    cityOpen = false
    tick().then(() => cityTriggerRef?.focus())
  }

  async function submit() {
    if (submitting) return
    submitting = true

    try {
      const res = await fetch('/api/user/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          username,
          phone: phone.trim() || null,
          city,
          avatar: avatarUrl || null,
          avatarPublicId: avatarPublicId || null,
          categories,
          description: descTrim,
          portfolioImages,
          portfolioImagesPublicIds,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.message ?? json?.error ?? 'Сталася помилка')
        return
      }

      success = true
      toast.success(
        isEdit ? 'Зміни збережено!' : 'Профіль надіслано на модерацію!',
      )
      await new Promise((r) => setTimeout(r, 1000))
      goto('/dashboard', { invalidateAll: true })
    } catch {
      toast.error('Помилка зʼєднання')
    } finally {
      submitting = false
    }
  }

  function initials(): string {
    return (name.trim() || data.user.email || '?')[0]?.toUpperCase() ?? '?'
  }
</script>

<svelte:head>
  <title>{isEdit ? 'Редагування профілю' : 'Оформлення профілю'} · Zunor</title>
</svelte:head>

<div
  class="min-h-svh px-4 pt-6 pb-20 md:py-14"
  style="background-color: var(--background)"
>
  <div class="max-w-lg mx-auto">
    <!-- Top bar -->
    <div class="flex items-center justify-between mb-10">
      <button
        type="button"
        onclick={leave}
        class="inline-flex items-center gap-2 text-sm cursor-pointer transition-opacity hover:opacity-60"
        style="color: var(--muted-foreground)"
      >
        <XIcon class="size-4" />
        {isEdit ? 'Скасувати' : 'Пропустити'}
      </button>
      <span class="text-xs tabular-nums" style="color: var(--muted-foreground)">
        {step} / {TOTAL_STEPS}
      </span>
    </div>

    <!-- Progress bar -->
    <div class="flex gap-1.5 mb-12">
      {#each Array(TOTAL_STEPS) as _, i}
        <div
          class="h-[3px] flex-1 rounded-full transition-all duration-500"
          style="background-color: {i < step
            ? 'var(--foreground)'
            : 'color-mix(in oklch, var(--foreground) 10%, transparent)'}"
        ></div>
      {/each}
    </div>

    <!-- Rejected banner -->
    {#if wasRejected && data.user.masterProfile?.verificationRejectReason}
      <div
        class="mb-8 p-4 rounded-xl flex items-start gap-3"
        style="background-color: color-mix(in oklch, var(--destructive) 8%, transparent);
               border: 1px solid color-mix(in oklch, var(--destructive) 22%, transparent)"
        role="alert"
      >
        <AlertCircleIcon
          class="size-5 shrink-0 mt-0.5"
          style="color: var(--destructive)"
        />
        <div>
          <p class="text-sm font-semibold" style="color: var(--destructive)">
            Профіль було відхилено
          </p>
          <p class="text-sm mt-1" style="color: var(--foreground)">
            {data.user.masterProfile.verificationRejectReason}
          </p>
        </div>
      </div>
    {/if}

    <!-- Steps -->
    {#key step}
      <div in:fly={{ y: 8, duration: 200 }}>
        <!-- ═══ STEP 1 ═══ -->
        {#if step === 1}
          <header class="mb-8">
            <p
              class="text-xs uppercase tracking-widest font-medium mb-3"
              style="color: var(--muted-foreground)"
            >
              Крок 1 — Основне
            </p>
            <h1
              class="text-3xl sm:text-4xl font-bold tracking-tight mb-2"
              style="color: var(--foreground); letter-spacing: -0.02em"
            >
              {isEdit ? 'Редагуйте профіль' : 'Розкажіть про себе'}
            </h1>
            <p style="color: var(--muted-foreground)">
              Контакти та місто роботи
            </p>
          </header>

          <Field.Group>
            <Field.Field>
              <Field.Label>Фото профілю</Field.Label>
              <div class="flex items-center gap-4">
                <AvatarUploader
                  bind:value={avatarUrl}
                  bind:publicId={avatarPublicId}
                  bind:uploading={avatarUploading}
                  fallback={initials()}
                  onError={(msg) => toast.error(msg)}
                />
                <p class="text-sm" style="color: var(--muted-foreground)">
                  Клікніть на фото щоб завантажити.<br />JPG, PNG до 5 МБ.
                </p>
              </div>
            </Field.Field>

            <Field.Field>
              <Field.Label for="name">Імʼя та прізвище</Field.Label>
              <Input
                id="name"
                type="text"
                placeholder="Олександр Петренко"
                bind:value={name}
                maxlength={80}
                class="h-11"
              />
            </Field.Field>

            <UsernameInput
              bind:value={username}
              bind:isValid={usernameValid}
              currentUsername={data.user.username ?? ''}
            />

            <Field.Field>
              <Field.Label for="phone">
                Телефон
                <span
                  class="text-[10px] font-normal uppercase tracking-wide ml-1.5"
                  style="color: var(--muted-foreground)">Опц.</span
                >
              </Field.Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+380 67 123 45 67"
                bind:value={phone}
                maxlength={30}
                class="h-11"
              />
            </Field.Field>

            <Field.Field>
              <Field.Label>Місто роботи</Field.Label>
              <Popover.Root bind:open={cityOpen}>
                <Popover.Trigger bind:ref={cityTriggerRef}>
                  {#snippet child({ props })}
                    <Button
                      {...props}
                      variant="outline"
                      role="combobox"
                      aria-expanded={cityOpen}
                      class={cn(
                        'w-full h-11 justify-between font-normal',
                        !city && 'text-muted-foreground',
                      )}
                    >
                      {cityName || 'Оберіть місто'}
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
                      <Command.Group>
                        {#each data.cities as c (c.slug)}
                          <Command.Item
                            value={c.name}
                            onSelect={() => selectCity(c.slug)}
                          >
                            <CheckIcon
                              class={cn(city !== c.slug && 'text-transparent')}
                            />
                            {c.name}
                            {#if c.region}
                              <span
                                class="ml-auto text-xs text-muted-foreground"
                                >{c.region}</span
                              >
                            {/if}
                          </Command.Item>
                        {/each}
                      </Command.Group>
                    </Command.List>
                  </Command.Root>
                </Popover.Content>
              </Popover.Root>
              <Field.Description
                >Клієнти з вашого міста бачитимуть вас у пошуку</Field.Description
              >
            </Field.Field>
          </Field.Group>

          <!-- ═══ STEP 2 ═══ -->
        {:else if step === 2}
          <header class="mb-8">
            <p
              class="text-xs uppercase tracking-widest font-medium mb-3"
              style="color: var(--muted-foreground)"
            >
              Крок 2 — Спеціалізація
            </p>
            <h1
              class="text-3xl sm:text-4xl font-bold tracking-tight mb-2"
              style="color: var(--foreground); letter-spacing: -0.02em"
            >
              Ваші категорії
            </h1>
            <p style="color: var(--muted-foreground)">
              Що ви вмієте? Оберіть до {MAX_CATS} напрямків
            </p>
          </header>

          <Field.Group>
            <Field.Field>
              <div class="flex items-baseline justify-between mb-3">
                <Field.Label>Категорії</Field.Label>
                <span
                  class="text-xs tabular-nums"
                  style="color: var(--muted-foreground)"
                >
                  {categories.length} / {MAX_CATS}
                </span>
              </div>

              <div class="flex flex-wrap gap-2">
                {#each data.categories as c (c.slug)}
                  {@const sel = categories.includes(c.slug)}
                  {@const disabled = !sel && categories.length >= MAX_CATS}
                  <button
                    type="button"
                    onclick={() => toggleCategory(c.slug)}
                    {disabled}
                    class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style="background-color: {sel
                      ? 'var(--foreground)'
                      : 'var(--card)'};
                           border-color: {sel
                      ? 'var(--foreground)'
                      : 'color-mix(in oklch, var(--foreground) 12%, transparent)'};
                           color: {sel
                      ? 'var(--background)'
                      : 'var(--foreground)'}"
                  >
                    {#if sel}<CheckIcon class="size-3.5" />{/if}
                    {c.icon ? `${c.icon} ` : ''}{c.name}
                  </button>
                {/each}
              </div>

              <Field.Description class="mt-3">
                Оберіть напрямки в яких ви маєте досвід і берете замовлення
              </Field.Description>
            </Field.Field>
          </Field.Group>

          <!-- ═══ STEP 3 ═══ -->
        {:else}
          <header class="mb-8">
            <p
              class="text-xs uppercase tracking-widest font-medium mb-3"
              style="color: var(--muted-foreground)"
            >
              Крок 3 — Презентація
            </p>
            <h1
              class="text-3xl sm:text-4xl font-bold tracking-tight mb-2"
              style="color: var(--foreground); letter-spacing: -0.02em"
            >
              Ваша візитка
            </h1>
            <p style="color: var(--muted-foreground)">
              Опис та приклади робіт — це перше, що бачить клієнт
            </p>
          </header>

          <Field.Group>
            <Field.Field>
              <div class="flex items-baseline justify-between">
                <Field.Label for="description">Опис послуг</Field.Label>
                <span
                  class={cn(
                    'text-[11px] tabular-nums',
                    descTrim.length > DESC_MAX * 0.9
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                  )}
                >
                  {descTrim.length}/{DESC_MAX}
                </span>
              </div>
              <Textarea
                id="description"
                placeholder="Розкажіть про себе, ваш досвід, підхід до роботи, що вирізняє вас серед інших майстрів..."
                bind:value={description}
                maxlength={DESC_MAX}
                rows={7}
                class={cn(
                  'resize-none',
                  descTrim.length > 0 &&
                    descTrim.length < DESC_MIN &&
                    'border-destructive',
                )}
              />
              {#if descTrim.length > 0 && descTrim.length < DESC_MIN}
                <Field.Description class="text-destructive">
                  Ще {DESC_MIN - descTrim.length} символів
                </Field.Description>
              {:else}
                <Field.Description>
                  Мінімум {DESC_MIN} символів. Клієнти читають це першим.
                </Field.Description>
              {/if}
            </Field.Field>

            <Field.Field>
              <div class="flex items-baseline justify-between mb-2">
                <Field.Label>
                  Приклади робіт
                  <span
                    class="text-[10px] font-normal uppercase tracking-wide ml-1.5"
                    style="color: var(--muted-foreground)">Опц.</span
                  >
                </Field.Label>
                <span
                  class="text-[11px] tabular-nums"
                  style="color: var(--muted-foreground)"
                >
                  {portfolioImages.length}/6
                </span>
              </div>
              <PortfolioUploader
                bind:images={portfolioImages}
                bind:publicIds={portfolioImagesPublicIds}
                bind:uploading={portfolioUploading}
                maxItems={6}
                onError={(msg) => toast.error(msg)}
              />
              <Field.Description
                >До 6 фото, JPG/PNG до 10 МБ кожне</Field.Description
              >
            </Field.Field>

            {#if !isEdit}
              <div
                class="p-4 rounded-xl text-sm leading-relaxed"
                style="background-color: color-mix(in oklch, var(--foreground) 4%, transparent);
                       border: 1px solid var(--border)"
              >
                <p class="font-medium mb-1" style="color: var(--foreground)">
                  Після відправки — перевірка модератором
                </p>
                <p style="color: var(--muted-foreground)">
                  Зазвичай займає до 24 годин. Ви отримаєте повідомлення.
                </p>
              </div>
            {:else if data.user.masterProfile?.verificationStatus === 'VERIFIED'}
              <div
                class="p-4 rounded-xl text-sm"
                style="background-color: color-mix(in oklch, #f59e0b 8%, transparent);
                       border: 1px solid color-mix(in oklch, #f59e0b 25%, transparent)"
              >
                <p class="font-medium mb-1" style="color: #b45309">
                  Зміни повторно пройдуть модерацію
                </p>
                <p style="color: var(--muted-foreground)">
                  Статус VERIFIED буде тимчасово замінено на «На модерації».
                </p>
              </div>
            {/if}
          </Field.Group>
        {/if}
      </div>
    {/key}

    <!-- Nav buttons -->
    <div
      class="flex items-center justify-between gap-3 mt-10 pt-6"
      style="border-top: 1px solid var(--border)"
    >
      <Button
        variant="ghost"
        onclick={back}
        disabled={step === 1}
        class="gap-2 h-11"
      >
        <ArrowLeftIcon class="size-4" />
        Назад
      </Button>

      <Button
        onclick={next}
        disabled={submitting ||
          success ||
          avatarUploading ||
          portfolioUploading}
        class="gap-2 h-11 min-w-44 rounded-xl"
      >
        {#if success}
          <CircleCheckBigIcon class="size-4" />
          Надіслано!
        {:else if submitting}
          <Spinner />
          Зберігаємо...
        {:else if step === TOTAL_STEPS}
          {isEdit ? 'Зберегти зміни' : 'Надіслати на модерацію'}
          <CheckIcon class="size-4" />
        {:else}
          Далі
          <ArrowRightIcon class="size-4" />
        {/if}
      </Button>
    </div>
  </div>
</div>
