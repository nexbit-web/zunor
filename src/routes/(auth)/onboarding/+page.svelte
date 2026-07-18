<!--
  Онбординг майстра — преміум glass на токенах теми.
  Логіка 1:1: normalizePhone/formatLocal, phoneValid, валідація кроків, next/back/leave,
  toggleCategory, selectCity, submit, initials, isEdit/wasRejected.
  Безпека: усе тут — UX; сервер /api/user/onboarding має валідувати все повторно.
-->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { fly } from 'svelte/transition'
  import { untrack, tick } from 'svelte'
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
  import { toast } from '$lib/stores/toast-store.svelte'
  import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left'
  import ArrowRightIcon from '@lucide/svelte/icons/arrow-right'
  import CheckIcon from '@lucide/svelte/icons/check'
  import XIcon from '@lucide/svelte/icons/x'
  import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down'
  import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
  import CircleCheckBigIcon from '@lucide/svelte/icons/circle-check-big'
  import InfoIcon from '@lucide/svelte/icons/info'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  const TOTAL_STEPS = 3
  const NAME_MAX = 80
  const DESC_MIN = 50
  const DESC_MAX = 922
  const MAX_CATS = 1

  const initial = untrack(() => data.user)
  const mp = initial.masterProfile

  let step = $state(1)

  let avatarUrl = $state(initial.avatar ?? '')
  let avatarPublicId = $state(initial.avatarPublicId ?? '')
  let avatarUploading = $state(false)

  let name = $state(initial.name ?? '')
  let username = $state(initial.username ?? '')
  let usernameValid = $state<boolean | null>(initial.username ? true : null)

  function normalizePhone(input: string): string {
    let d = input.replace(/\D/g, '')
    if (d.startsWith('380')) d = d.slice(3)
    else if (d.startsWith('80')) d = d.slice(2)
    else if (d.startsWith('0')) d = d.slice(1)
    return d.slice(0, 9)
  }
  function formatLocal(d: string): string {
    let out = d.slice(0, 2)
    if (d.length > 2) out += ' ' + d.slice(2, 5)
    if (d.length > 5) out += ' ' + d.slice(5, 7)
    if (d.length > 7) out += ' ' + d.slice(7, 9)
    return out
  }
  let phoneDigits = $state(normalizePhone(initial.phone ?? ''))
  let phoneTouched = $state(false)
  const phoneDisplayLocal = $derived(formatLocal(phoneDigits))
  function onPhoneInput(e: Event) {
    const el = e.currentTarget as HTMLInputElement
    phoneDigits = normalizePhone(el.value)
    el.value = formatLocal(phoneDigits) // примусова синхронізація DOM
  }
  // Перша цифра укр. мобільного коду: 3, 5, 6, 7, 9.
  const phoneValid = $derived(
    phoneDigits.length === 9 && /^[35679]/.test(phoneDigits),
  )
  const phoneError = $derived(
    phoneTouched && !phoneValid
      ? phoneDigits.length === 0
        ? 'Введіть номер телефону'
        : 'Перевірте номер: +380 XX XXX XX XX'
      : '',
  )

  let city = $state(initial.city ?? '')
  let cityOpen = $state(false)
  let cityTriggerRef = $state<HTMLButtonElement | null>(null)

  let categories = $state<string[]>(mp?.categories ?? [])
  let description = $state(mp?.description ?? '')
  let portfolioImages = $state<string[]>(mp?.portfolioImages ?? [])
  let portfolioImagesPublicIds = $state<string[]>(
    mp?.portfolioImagesPublicIds ?? [],
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
  const descError = $derived(descTrim.length > 0 && descTrim.length < DESC_MIN)

  const step1Valid = $derived(
    name.trim().length >= 2 && usernameValid === true && phoneValid && !!city,
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
        phoneTouched = true
        if (name.trim().length < 2) toast.error('Введіть імʼя (мін. 2 символи)')
        else if (usernameValid !== true) toast.error('Перевірте username')
        else if (!phoneValid) toast.error('Введіть коректний телефон')
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
          phone: '+380' + phoneDigits,
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
        submitting = false
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
      submitting = false
    }
  }

  function initials(): string {
    return (name.trim() || data.user.email || '?')[0]?.toUpperCase() ?? '?'
  }

  const cardCls =
    'rounded-[32px] border border-border bg-card p-8 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.1),0_8px_20px_-8px_rgba(0,0,0,0.05)]'
</script>

<svelte:head>
  <title>{isEdit ? 'Редагування профілю' : 'Оформлення профілю'} · Zunor</title>
</svelte:head>

<div class="min-h-svh px-5 pt-8 pb-20 md:pt-12">
  <div class="mx-auto flex max-w-118 flex-col gap-5">
    <!-- Top bar -->
    <div class="flex items-center justify-between">
      <button
        type="button"
        onclick={leave}
        class="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-[13.5px] font-medium text-muted-foreground transition-opacity hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <XIcon class="size-3.75" aria-hidden="true" />
        {isEdit ? 'Скасувати' : 'Пропустити'}
      </button>
      <span
        class="text-[12.5px] font-semibold tabular-nums text-muted-foreground"
        >{step} / {TOTAL_STEPS}</span
      >
    </div>

    <!-- Progress segments -->
    <div class="flex gap-1.5" aria-hidden="true">
      {#each Array(TOTAL_STEPS) as _, i (i)}
        <div
          class={cn(
            'h-1 flex-1 rounded-full transition-colors duration-500',
            i < step ? 'bg-primary' : 'bg-primary/10',
          )}
        ></div>
      {/each}
    </div>

    <!-- Rejected banner -->
    {#if wasRejected && data.user.masterProfile?.verificationRejectReason}
      <div
        class="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-4"
        role="alert"
      >
        <AlertCircleIcon
          class="mt-0.5 size-5 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div>
          <p class="text-sm font-semibold text-destructive">
            Профіль було відхилено
          </p>
          <p class="mt-1 text-sm text-foreground">
            {data.user.masterProfile.verificationRejectReason}
          </p>
        </div>
      </div>
    {/if}

    <div class={cardCls}>
      {#key step}
        <div in:fly={{ y: 8, duration: 200 }}>
          <!-- ═══ STEP 1 ═══ -->
          {#if step === 1}
            <p
              class="mb-3 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
            >
              Крок 1 — Основне
            </p>
            <h1
              class="mb-1.75 text-[28px] font-bold tracking-[-0.035em] text-foreground"
            >
              {isEdit ? 'Редагуйте профіль' : 'Розкажіть про себе'}
            </h1>
            <p
              class="mb-1.75 text-[14.5px] leading-relaxed text-muted-foreground"
            >
              Контакти та місто, де ви берете замовлення.
            </p>

            <Field.Group class="gap-5">
              <Field.Field>
                <Field.Label class="text-[13.5px] font-semibold text-foreground"
                  >Фото профілю</Field.Label
                >
                <div class="flex items-center gap-4">
                  <AvatarUploader
                    bind:value={avatarUrl}
                    bind:publicId={avatarPublicId}
                    bind:uploading={avatarUploading}
                    fallback={initials()}
                    onError={(msg) => toast.error(msg)}
                  />
                  <p class="text-[13px] leading-snug text-muted-foreground">
                    Клікніть на фото, щоб завантажити.<br />JPG, PNG до
                    5&nbsp;МБ.
                  </p>
                </div>
              </Field.Field>

              <Field.Field>
                <Field.Label
                  for="name"
                  class="text-[13.5px] font-semibold text-foreground"
                  >Ім'я та прізвище</Field.Label
                >
                <Input
                  id="name"
                  type="text"
                  placeholder="Олександр Петренко"
                  bind:value={name}
                  maxlength={NAME_MAX}
                  autocomplete="name"
                  autocapitalize="words"
                  class="onb-input"
                />
              </Field.Field>

              <UsernameInput
                bind:value={username}
                bind:isValid={usernameValid}
                currentUsername={data.user.username ?? ''}
              />

              <!-- Телефон -->
              <Field.Field>
                <Field.Label
                  for="phone"
                  class="text-[13.5px] font-semibold text-foreground"
                  >Телефон</Field.Label
                >
                <div
                  class={cn(
                    'onb-phone flex h-12.5 items-center overflow-hidden rounded-[14px]',
                    phoneError && 'has-error',
                  )}
                >
                  <span
                    class="shrink-0 pr-2 pl-4 font-semibold tabular-nums text-muted-foreground select-none"
                    >+380</span
                  >
                  <input
                    id="phone"
                    type="tel"
                    inputmode="numeric"
                    autocomplete="tel-national"
                    value={phoneDisplayLocal}
                    oninput={onPhoneInput}
                    onblur={() => (phoneTouched = true)}
                    placeholder="67 123 45 67"
                    aria-invalid={!!phoneError}
                    aria-describedby={phoneError ? 'phone-err' : 'phone-hint'}
                    class="h-full flex-1 bg-transparent pr-4 text-[14.5px] font-medium tabular-nums text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
                  />
                </div>
                {#if phoneError}
                  <Field.Description
                    id="phone-err"
                    class="text-[12.5px] text-destructive"
                    >{phoneError}</Field.Description
                  >
                {:else}
                  <Field.Description
                    id="phone-hint"
                    class="text-[12.5px] text-muted-foreground"
                    >Клієнт побачить його лише після того, як обере вас.</Field.Description
                  >
                {/if}
              </Field.Field>

              <!-- Місто -->
              <Field.Field>
                <Field.Label class="text-[13.5px] font-semibold text-foreground"
                  >Місто роботи</Field.Label
                >
                <Popover.Root bind:open={cityOpen}>
                  <Popover.Trigger>
                    {#snippet child({ props })}
                      <button
                        {...props}
                        bind:this={cityTriggerRef}
                        type="button"
                        role="combobox"
                        aria-expanded={cityOpen}
                        class="onb-input flex items-center justify-between"
                      >
                        <span
                          class={cn(
                            'truncate',
                            !city && 'font-normal text-muted-foreground',
                          )}>{cityName || 'Оберіть місто'}</span
                        >
                        <ChevronsUpDownIcon
                          class="size-4.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </button>
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
                                class={cn(
                                  city !== c.slug && 'text-transparent',
                                )}
                                aria-hidden="true"
                              />
                              {c.name}
                              {#if c.region}<span
                                  class="ml-auto text-xs text-muted-foreground"
                                  >{c.region}</span
                                >{/if}
                            </Command.Item>
                          {/each}
                        </Command.Group>
                      </Command.List>
                    </Command.Root>
                  </Popover.Content>
                </Popover.Root>
                <Field.Description class="text-[12.5px] text-muted-foreground"
                  >Клієнти з вашого міста бачитимуть ваші відгуки на заявки.</Field.Description
                >
              </Field.Field>
            </Field.Group>

            <!-- ═══ STEP 2 ═══ -->
          {:else if step === 2}
            <p
              class="mb-3 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
            >
              Крок 2 — Спеціалізація
            </p>
            <h1
              class="mb-1.75 text-[28px] font-bold tracking-[-0.035em] text-foreground"
            >
              Ваша категорія
            </h1>
            <p
              class="mb-6.5 text-[14.5px] leading-relaxed text-muted-foreground"
            >
              Що ви вмієте? Оберіть до {MAX_CATS} напрямків.
            </p>

            <Field.Field>
              <div class="mb-3 flex items-baseline justify-between">
                <Field.Label class="text-[13.5px] font-semibold text-foreground"
                  >Категорії</Field.Label
                >
                <span
                  class="text-[11.5px] font-semibold tabular-nums text-muted-foreground"
                  >{categories.length} / {MAX_CATS}</span
                >
              </div>

              <div class="flex flex-wrap gap-2.5">
                {#each data.categories as c (c.slug)}
                  {@const sel = categories.includes(c.slug)}
                  {@const disabled = !sel && categories.length >= MAX_CATS}
                  <button
                    type="button"
                    onclick={() => toggleCategory(c.slug)}
                    {disabled}
                    aria-pressed={sel}
                    class={cn(
                      'inline-flex cursor-pointer items-center gap-1.75 rounded-[14px] px-4 py-2.75 text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                      sel
                        ? 'border border-transparent bg-primary text-white'
                        : 'border border-border bg-card text-foreground hover:border-ring',
                      disabled &&
                        'cursor-not-allowed opacity-40 hover:border-border',
                    )}
                  >
                    <span
                      class={cn(
                        'size-1.75 rounded-full bg-current',
                        sel ? 'opacity-100' : 'opacity-35',
                      )}
                    ></span>
                    {c.name}
                  </button>
                {/each}
              </div>
              <Field.Description
                class="mt-3 text-[12.5px] text-muted-foreground"
                >Обирайте напрямки, у яких маєте досвід і берете замовлення.</Field.Description
              >
            </Field.Field>

            <!-- ═══ STEP 3 ═══ -->
          {:else}
            <p
              class="mb-3 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
            >
              Крок 3 — Презентація
            </p>
            <h1
              class="mb-1.75 text-[28px] font-bold tracking-[-0.035em] text-foreground"
            >
              Ваша візитка
            </h1>
            <p
              class="mb-6.5 text-[14.5px] leading-relaxed text-muted-foreground"
            >
              Опис і приклади робіт — це перше, що бачить клієнт.
            </p>

            <Field.Group class="gap-5">
              <Field.Field>
                <div class="flex items-baseline justify-between">
                  <Field.Label
                    for="description"
                    class="text-[13.5px] font-semibold text-foreground"
                    >Опис послуг</Field.Label
                  >
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
                  placeholder="Розкажіть про себе, свій досвід, підхід до роботи, що вирізняє вас серед інших майстрів..."
                  bind:value={description}
                  maxlength={DESC_MAX}
                  rows={7}
                  aria-invalid={descError}
                  aria-describedby="desc-hint"
                  class={cn(
                    'onb-input resize-none py-3.5 leading-relaxed',
                    descError && 'has-error',
                  )}
                />
                {#if descError}
                  <Field.Description
                    id="desc-hint"
                    class="text-[12.5px] text-destructive"
                    >Ще {DESC_MIN - descTrim.length} символів</Field.Description
                  >
                {:else}
                  <Field.Description
                    id="desc-hint"
                    class="text-[12.5px] text-muted-foreground"
                    >Мінімум {DESC_MIN} символів. Клієнти читають це першим.</Field.Description
                  >
                {/if}
              </Field.Field>

              <Field.Field>
                <div class="mb-2 flex items-baseline justify-between">
                  <Field.Label
                    class="text-[13.5px] font-semibold text-foreground"
                  >
                    Приклади робіт
                    <span
                      class="ml-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
                      >Опц.</span
                    >
                  </Field.Label>
                  <span class="text-[11px] tabular-nums text-muted-foreground"
                    >{portfolioImages.length}/6</span
                  >
                </div>
                <PortfolioUploader
                  bind:images={portfolioImages}
                  bind:publicIds={portfolioImagesPublicIds}
                  bind:uploading={portfolioUploading}
                  maxItems={6}
                  onError={(msg) => toast.error(msg)}
                />
                <Field.Description class="text-[12.5px] text-muted-foreground"
                  >До 6 фото, JPG/PNG до 10&nbsp;МБ кожне.</Field.Description
                >
              </Field.Field>

              {#if !isEdit}
                <div
                  class="flex gap-3 rounded-2xl border border-border bg-muted p-4"
                >
                  <InfoIcon
                    class="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <p class="text-[13.5px] font-semibold text-foreground">
                      Після відправки — перевірка модератором
                    </p>
                    <p
                      class="mt-0.5 text-[13px] leading-relaxed text-muted-foreground"
                    >
                      Зазвичай займає до 24 годин. Ви отримаєте повідомлення.
                    </p>
                  </div>
                </div>
              {:else if data.user.masterProfile?.verificationStatus === 'VERIFIED'}
                <div
                  class="flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4"
                >
                  <AlertCircleIcon
                    class="mt-0.5 size-5 shrink-0 text-amber-600"
                    aria-hidden="true"
                  />
                  <div>
                    <p class="text-[13.5px] font-semibold text-amber-700">
                      Зміни повторно пройдуть модерацію
                    </p>
                    <p
                      class="mt-0.5 text-[13px] leading-relaxed text-muted-foreground"
                    >
                      Статус VERIFIED буде тимчасово замінено на «На модерації».
                    </p>
                  </div>
                </div>
              {/if}
            </Field.Group>
          {/if}
        </div>
      {/key}

      <!-- Nav -->
      <div
        class="mt-6.5 flex items-center justify-between gap-3 border-t border-border pt-5.5"
      >
        <button
          type="button"
          onclick={back}
          disabled={step === 1}
          class="inline-flex h-12.5 cursor-pointer items-center gap-1.75 rounded-[14px] px-4.5 text-[14.5px] font-medium text-muted-foreground transition-colors hover:bg-primary-hover/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
        >
          <ArrowLeftIcon class="size-4" aria-hidden="true" />
          Назад
        </button>

        <Button
          type="button"
          onclick={next}
          disabled={submitting ||
            success ||
            avatarUploading ||
            portfolioUploading}
          aria-busy={submitting}
          class="relative inline-flex h-12.5 min-w-47.5 items-center justify-center rounded-[14px] bg-primary px-6 text-[14.5px] font-semibold text-white transition hover:-translate-y-px active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          {#if submitting}
            <span class="pointer-events-none">Зачекайте...</span>
            <Spinner
              class="absolute right-4 animate-spin"
              aria-hidden="true"
            />
          {:else if success}
            <span class="pointer-events-none inline-flex items-center gap-2.25">
              <CircleCheckBigIcon class="size-4" aria-hidden="true" /> Надіслано!
            </span>
          {:else if step === TOTAL_STEPS}
            <span class="pointer-events-none inline-flex items-center gap-2.25">
              {isEdit ? 'Зберегти' : 'Надіслати на модерацію'}
            </span>
          {:else}
            <span class="pointer-events-none inline-flex items-center gap-2.25">
              Далі
              <ArrowRightIcon class="size-4" aria-hidden="true" />
            </span>
          {/if}
        </Button>
      </div>
    </div>
  </div>
</div>

<style>
  :global(body:has(.onb-scope)) {
    background:
      radial-gradient(
        130% 90% at 12% -5%,
        color-mix(in oklch, var(--muted) 55%, var(--background)) 0%,
        transparent 50%
      ),
      radial-gradient(
        130% 90% at 100% 105%,
        color-mix(in oklch, var(--secondary) 60%, var(--background)) 0%,
        transparent 52%
      ),
      var(--background);
  }

  /* Спільний вигляд input / textarea / city-trigger.
     :global бо клас потрапляє в Input/Textarea-компоненти; обмежено .onb-scope.
     padding-left/right (не shorthand!), щоб Tailwind py-* у textarea не конфліктував. */
  .onb-scope :global(.onb-input) {
    width: 100%;
    min-height: 50px;
    padding-left: 16px;
    padding-right: 16px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--muted);
    color: var(--foreground);
    font-size: 14.5px;
    font-weight: 500;
    outline: none;
    transition:
      border-color 0.16s ease,
      background 0.16s ease,
      box-shadow 0.16s ease;
  }
  .onb-scope :global(.onb-input::placeholder) {
    color: var(--muted-foreground);
    font-weight: 400;
  }
  .onb-scope :global(.onb-input:focus),
  .onb-scope :global(.onb-input:focus-within),
  .onb-scope :global(.onb-input[data-state='open']) {
    background: var(--background);
    border-color: var(--ring);
    box-shadow: 0 0 0 4px color-mix(in oklch, var(--ring) 22%, transparent);
  }
  .onb-scope :global(.onb-input.has-error) {
    border-color: var(--destructive);
  }

  /* Телефон — окрема рамка з префіксом +380. */
  .onb-phone {
    border: 1px solid var(--border);
    background: var(--muted);
    transition:
      border-color 0.16s ease,
      background 0.16s ease,
      box-shadow 0.16s ease;
  }
  .onb-phone:focus-within {
    border-color: var(--ring);
    background: var(--background);
    box-shadow: 0 0 0 4px color-mix(in oklch, var(--ring) 22%, transparent);
  }
  .onb-phone.has-error {
    border-color: var(--destructive);
  }

  @media (prefers-reduced-motion: reduce) {
    .onb-scope :global(.onb-input),
    .onb-phone {
      transition: none;
    }
  }
</style>
