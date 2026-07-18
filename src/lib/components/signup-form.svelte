<script lang="ts" module>
  import { dev } from '$app/environment'

  // ─── Module-level кеш міст ───
  interface CityRef {
    slug: string
    name: string
  }

  let citiesCache: CityRef[] | null = null
  let citiesPromise: Promise<CityRef[]> | null = null

  async function fetchCities(): Promise<CityRef[]> {
    if (citiesCache) return citiesCache
    if (citiesPromise) return citiesPromise

    citiesPromise = (async () => {
      try {
        const res = await fetch('/api/cities')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        const arr: CityRef[] = Array.isArray(json)
          ? json
          : (json.cities ?? json.data ?? [])
        citiesCache = arr
        return arr
      } catch (err) {
        if (dev) console.error('[register] failed to load cities:', err)
        citiesPromise = null
        throw err
      }
    })()

    return citiesPromise
  }

  // ─── Валідатори (чисті функції) ───
  const NAME_RE = /^[\p{L}\s'-]{2,50}$/u
  const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

  // Український мобільний: 9 цифр локальної частини (без +380).
  // Коди операторів: 39, 50, 63, 66, 67, 68, 73, 91–99.
  const UA_MOBILE_LOCAL_RE = /^(?:39|50|63|66|67|68|73|9[1-9])\d{7}$/

  function isValidUaMobile(localDigits: string): boolean {
    return UA_MOBILE_LOCAL_RE.test(localDigits)
  }

  /** Витягує 9 локальних цифр із будь-якого вводу: +380.., 380.., 0.., чисті цифри. */
  function extractUaLocal(input: string): string {
    let d = input.replace(/\D/g, '')
    if (d.startsWith('380')) d = d.slice(3)
    else if (d.startsWith('0')) d = d.slice(1)
    return d.slice(0, 9)
  }

  /** 9 цифр → "67 123 45 67". */
  function formatUaLocal(d: string): string {
    return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)]
      .filter(Boolean)
      .join(' ')
  }

  function isValidName(name: string): boolean {
    return NAME_RE.test(name.trim())
  }
  function isValidEmail(email: string): boolean {
    const t = email.trim()
    return t.length >= 3 && t.length <= 254 && EMAIL_RE.test(t)
  }
  function passwordStrength(pw: string): {
    score: 0 | 1 | 2 | 3
    label: string
  } {
    if (pw.length < 8) return { score: 0, label: 'Закороткий' }
    let score = 0
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
    if (/\d/.test(pw)) score++
    if (/[^a-zA-Z0-9]/.test(pw) || pw.length >= 12) score++
    if (score <= 1) return { score: 1, label: 'Слабкий' }
    if (score === 2) return { score: 2, label: 'Середній' }
    return { score: 3, label: 'Надійний' }
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Popover from '$lib/components/ui/popover/index.js'
  import * as Command from '$lib/components/ui/command/index.js'
  import type { HTMLAttributes } from 'svelte/elements'
  import { signUp } from '$lib/auth-client'
  import { goto, invalidateAll } from '$app/navigation'
  import {
    BriefcaseBusiness,
    ChevronRight,
    UserCircle2,
    Check,
    ChevronsUpDown,
    Eye,
    EyeOff,
    LoaderCircle,
    AlertCircle,
    CheckCircle2,
  } from 'lucide-svelte'
  import { onMount, onDestroy, tick } from 'svelte'
  import { fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { Checkbox } from './ui/checkbox'

  let { class: className, ...restProps }: HTMLAttributes<HTMLDivElement> =
    $props()
  const uid = $props.id() // унікальні id полів (захист від колізій при кількох інстансах)

  type Role = 'CLIENT' | 'MASTER'
  type Step = 'role' | 'form' | 'otp'

  // ─── State ───
  let step = $state<Step>('role')
  let direction = $state<1 | -1>(1)
  let role = $state<Role | null>(null)

  let name = $state('')
  let phoneDigits = $state('')
  let email = $state('')
  let citySlug = $state('')
  let password = $state('')
  let confirm = $state('')
  let agreeTerms = $state(false)
  let otp = $state('')

  let touched = $state({
    name: false,
    phone: false,
    email: false,
    city: false,
    password: false,
    confirm: false,
  })

  let showPassword = $state(false)
  let cityOpen = $state(false)
  let cityTriggerRef = $state<HTMLButtonElement | null>(null)

  let loading = $state(false)
  let serverError = $state('')
  let resendTimer = $state(0)
  let timerInterval: ReturnType<typeof setInterval> | null = null

  // ─── Cities ───
  let cities = $state<CityRef[]>(citiesCache ?? [])
  let citiesLoading = $state(!citiesCache)

  onMount(async () => {
    if (citiesCache) return
    try {
      cities = await fetchCities()
    } catch {
      // silent fail — користувач зможе обрати пізніше / fallback на сервері
    } finally {
      citiesLoading = false
    }
  })

  onDestroy(() => {
    if (timerInterval) clearInterval(timerInterval)
  })

  // ─── Derived: валідація (UX-рівень; авторитет — сервер) ───
  const nameError = $derived(
    touched.name && !isValidName(name)
      ? "Введіть коректне ім'я (2-50 літер)"
      : '',
  )
  const phone = $derived(phoneDigits ? '+380' + phoneDigits : '')
  const phoneValid = $derived(isValidUaMobile(phoneDigits))
  const phoneError = $derived(
    touched.phone && !phoneValid
      ? phoneDigits.length === 0
        ? 'Введіть номер телефону'
        : 'Перевірте номер: +380 XX XXX XX XX'
      : '',
  )

  function onPhoneInput(e: Event) {
    const el = e.currentTarget as HTMLInputElement
    phoneDigits = extractUaLocal(el.value)
    // Примусово синхронізуємо поле: якщо зайвий символ обрізався, phoneDigits не змінюється,
    // тож Svelte не перерендерить value — і символ лишиться в DOM. Ставимо вручну.
    el.value = formatUaLocal(phoneDigits)
  }

  const emailError = $derived(
    touched.email && !isValidEmail(email) ? 'Невірний формат email' : '',
  )
  const cityError = $derived(touched.city && !citySlug ? 'Оберіть місто' : '')
  const passwordError = $derived(
    touched.password && password.length < 8 ? 'Мінімум 8 символів' : '',
  )
  const confirmError = $derived(
    touched.confirm && password !== confirm ? 'Паролі не збігаються' : '',
  )
  const pwStrength = $derived(passwordStrength(password))

  const formValid = $derived(
    isValidName(name) &&
      phoneValid &&
      isValidEmail(email) &&
      !!citySlug &&
      password.length >= 8 &&
      password === confirm &&
      agreeTerms,
  )

  const selectedCityLabel = $derived(
    cities.find((c) => c.slug === citySlug)?.name ?? 'Оберіть місто',
  )
  const stepIndex = $derived(step === 'role' ? 0 : step === 'form' ? 1 : 2)

  // ─── Actions ───
  function selectRole(r: Role) {
    direction = 1
    role = r
    serverError = ''
    step = 'form'
  }
  function backToRole() {
    direction = -1
    serverError = ''
    step = 'role'
  }
  function backToForm() {
    direction = -1
    serverError = ''
    otp = ''
    step = 'form'
  }
  function selectCity(slug: string) {
    citySlug = slug
    touched.city = true
    cityOpen = false
    tick().then(() => cityTriggerRef?.focus())
  }
  function startTimer() {
    resendTimer = 60
    if (timerInterval) clearInterval(timerInterval)
    timerInterval = setInterval(() => {
      resendTimer--
      if (resendTimer <= 0 && timerInterval) {
        clearInterval(timerInterval)
        timerInterval = null
      }
    }, 1000)
  }

  async function sendOtp(emailAddr: string): Promise<boolean> {
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailAddr.trim().toLowerCase() }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async function handleForm(e: SubmitEvent) {
    e.preventDefault()
    if (loading) return
    touched = {
      name: true,
      phone: true,
      email: true,
      city: true,
      password: true,
      confirm: true,
    }
    if (!formValid) {
      serverError = 'Перевірте правильність заповнення полів'
      return
    }
    loading = true
    serverError = ''
    try {
      const sent = await sendOtp(email)
      if (!sent) {
        serverError = 'Не вдалось відправити код. Перевірте email.'
        return
      }
      startTimer()
      direction = 1
      step = 'otp'
    } finally {
      loading = false
    }
  }

  async function handleOtp(e: SubmitEvent) {
    e.preventDefault()
    if (loading) return
    serverError = ''
    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      serverError = 'Введіть 6-значний код'
      return
    }
    loading = true
    try {
      const verifyRes = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: otp }),
      })
      const verifyData = await verifyRes.json().catch(() => ({}))
      if (!verifyRes.ok) {
        serverError = verifyData.error ?? 'Невірний або застарілий код'
        return
      }

      const { error: signUpError } = await signUp.email({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      })
      if (signUpError) {
        serverError = signUpError.message ?? 'Помилка реєстрації'
        return
      }

      const cityName = cities.find((c) => c.slug === citySlug)?.name ?? null
      await fetch('/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, phone, city: cityName }),
      })

      await invalidateAll()
      if (timerInterval) clearInterval(timerInterval)
      goto('/dashboard')
    } catch (err) {
      if (dev) console.error('[register] otp flow failed:', err)
      serverError = 'Сталась помилка. Спробуйте ще раз.'
    } finally {
      loading = false
    }
  }

  async function handleResend() {
    if (resendTimer > 0 || loading) return
    serverError = ''
    otp = ''
    const sent = await sendOtp(email)
    if (sent) startTimer()
    else serverError = 'Не вдалось відправити код'
  }

  const FLY_DURATION = 320
  const FLY_DISTANCE = 32
</script>

{#snippet errBox(msg: string)}
  <div
    class="flex items-start gap-2.5 rounded-[13px] border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-[13.5px] leading-snug text-destructive"
    role="alert"
  >
    <AlertCircle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    <span>{msg}</span>
  </div>
{/snippet}

<div
  class={cn('reg-scope flex w-full max-w-113 flex-col gap-5', className)}
  {...restProps}
>
  <!-- progress -->
  <p class="sr-only" aria-live="polite">Крок {stepIndex + 1} із 3</p>
  <div class="flex items-center justify-center gap-1.75" aria-hidden="true">
    {#each [0, 1, 2] as i (i)}
      <span
        class={cn(
          'h-1.75 rounded-full transition-all duration-300',
          i === stepIndex
            ? 'w-5.5 bg-primary'
            : i < stepIndex
              ? 'w-1.75 bg-primary'
              : 'w-1.75 bg-border',
        )}
      ></span>
    {/each}
  </div>

  <!-- glass card -->
  <div
    class="overflow-hidden rounded-[32px] border border-border bg-card px-8 pt-8.5 pb-7.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.1),0_8px_20px_-8px_rgba(0,0,0,0.05)]"
  >
    <!-- ─── Крок 1: Роль ─── -->
    {#if step === 'role'}
      <div
        in:fly={{
          x: direction * FLY_DISTANCE * -1,
          duration: FLY_DURATION,
          easing: cubicOut,
          opacity: 0,
        }}
      >
        <div class="mb-6 text-center">
          <h1 class="text-[23px] font-bold tracking-[-0.035em] text-foreground">
            Хто ви?
          </h1>
          <p class="mt-1.5 text-sm text-muted-foreground">
            Оберіть, як ви плануєте користуватися Zunor
          </p>
        </div>

        <div class="flex flex-col gap-3">
          {#each [{ r: 'CLIENT' as Role, icon: UserCircle2, title: 'Я замовник', desc: 'Хочу замовляти' }, { r: 'MASTER' as Role, icon: BriefcaseBusiness, title: 'Я майстер', desc: 'Хочу заробляти' }] as item (item.r)}
            <button
              type="button"
              onclick={() => selectRole(item.r)}
              class="group flex items-center gap-4.5 rounded-[20px] border border-transparent bg-muted p-4.5 text-left transition-all duration-200 hover:border-border hover:bg-card hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.16)] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span
                class="flex size-13 shrink-0 items-center justify-center rounded-[15px] bg-card text-foreground shadow-sm transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground"
              >
                <item.icon size={26} strokeWidth={1.6} aria-hidden="true" />
              </span>
              <div>
                <p
                  class="text-base font-semibold tracking-[-0.01em] text-foreground"
                >
                  {item.title}
                </p>
                <p class="mt-0.5 text-[13.5px] text-muted-foreground">
                  {item.desc}
                </p>
              </div>
              <span
                class="ml-auto -translate-x-1.5 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-primary group-hover:opacity-100"
              >
                <ChevronRight size={20} aria-hidden="true" />
              </span>
            </button>
          {/each}
        </div>

        <p class="mt-4 text-center text-[13.5px] text-muted-foreground">
          Вже є акаунт?
          <a
            href="/user/login"
            class="rounded-sm font-semibold text-primary underline-offset-[3px] hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Увійти
          </a>
        </p>
      </div>

      <!-- ─── Крок 2: Форма ─── -->
    {:else if step === 'form'}
      <div
        in:fly={{
          x: direction * FLY_DISTANCE,
          duration: FLY_DURATION,
          easing: cubicOut,
          opacity: 0,
        }}
      >
        <div class="mb-6 text-center">
          <h1
            class="flex items-center justify-center gap-2.5 text-[23px] font-bold tracking-[-0.035em] text-foreground"
          >
            {#if role === 'CLIENT'}
              <UserCircle2 size={20} strokeWidth={1.8} aria-hidden="true" />
            {:else}
              <BriefcaseBusiness
                size={20}
                strokeWidth={1.8}
                aria-hidden="true"
              />
            {/if}
            {role === 'CLIENT' ? 'Замовник' : 'Виконавець'}
          </h1>
          <p class="mt-1.5 text-sm text-muted-foreground">
            Заповніть дані для реєстрації
          </p>
        </div>

        <form
          onsubmit={handleForm}
          novalidate
          autocomplete="on"
          class="flex flex-col gap-4"
        >
          <!-- Ім'я -->
          <div class="flex flex-col gap-2">
            <label
              for="name-{uid}"
              class="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground"
              >Ім'я</label
            >
            <div class="relative">
              <input
                id="name-{uid}"
                type="text"
                placeholder="Іван Петренко"
                bind:value={name}
                onblur={() => (touched.name = true)}
                autocomplete="name"
                autocapitalize="words"
                maxlength={50}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? `name-err-${uid}` : undefined}
                class={cn(
                  'field-input pr-10',
                  touched.name && isValidName(name) && 'is-valid',
                )}
                required
              />
              {#if touched.name && isValidName(name)}
                <CheckCircle2
                  class="pointer-events-none absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-emerald-500"
                  aria-hidden="true"
                />
              {:else if nameError}
                <AlertCircle
                  class="pointer-events-none absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-destructive"
                  aria-hidden="true"
                />
              {/if}
            </div>
            {#if nameError}<p
                id="name-err-{uid}"
                class="text-[12.5px] text-destructive"
              >
                {nameError}
              </p>{/if}
          </div>

          <!-- Телефон -->
          <div class="flex flex-col gap-2">
            <label
              for="phone-{uid}"
              class="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground"
            >
              Телефон
            </label>
            <div class="relative">
              <!-- фіксований префікс -->
              <span
                class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[14.5px] font-medium text-muted-foreground select-none"
              >
                +380
              </span>
              <input
                id="phone-{uid}"
                type="tel"
                inputmode="numeric"
                autocomplete="tel-national"
                placeholder="XX XXX XX XX"
                value={formatUaLocal(phoneDigits)}
                oninput={onPhoneInput}
                onblur={() => (touched.phone = true)}
                aria-invalid={!!phoneError}
                aria-describedby={phoneError ? `phone-err-${uid}` : undefined}
                class={cn(
                  'field-input has-prefix pr-10',
                  touched.phone && phoneValid && 'is-valid',
                )}
                required
              />
              {#if touched.phone && phoneValid}
                <CheckCircle2
                  class="pointer-events-none absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-emerald-500"
                  aria-hidden="true"
                />
              {:else if phoneError}
                <AlertCircle
                  class="pointer-events-none absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-destructive"
                  aria-hidden="true"
                />
              {/if}
            </div>
            {#if phoneError}
              <p id="phone-err-{uid}" class="text-[12.5px] text-destructive">
                {phoneError}
              </p>
            {/if}
          </div>

          <!-- Email -->
          <div class="flex flex-col gap-2">
            <label
              for="email-{uid}"
              class="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground"
              >Email</label
            >
            <div class="relative">
              <input
                id="email-{uid}"
                type="email"
                inputmode="email"
                autocapitalize="none"
                spellcheck="false"
                placeholder="ivan@example.com"
                bind:value={email}
                onblur={() => (touched.email = true)}
                autocomplete="email"
                maxlength={254}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? `email-err-${uid}` : undefined}
                class={cn(
                  'field-input pr-10',
                  touched.email && isValidEmail(email) && 'is-valid',
                )}
                required
              />
              {#if touched.email && isValidEmail(email)}
                <CheckCircle2
                  class="pointer-events-none absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-emerald-500"
                  aria-hidden="true"
                />
              {:else if emailError}
                <AlertCircle
                  class="pointer-events-none absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-destructive"
                  aria-hidden="true"
                />
              {/if}
            </div>
            {#if emailError}<p
                id="email-err-{uid}"
                class="text-[12.5px] text-destructive"
              >
                {emailError}
              </p>{/if}
          </div>

          <!-- Місто -->
          <div class="flex flex-col gap-2">
            <label
              for="city-{uid}"
              class="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground"
              >Місто</label
            >
            <Popover.Root bind:open={cityOpen}>
              <Popover.Trigger>
                {#snippet child({ props })}
                  <button
                    {...props}
                    id="city-{uid}"
                    bind:this={cityTriggerRef}
                    type="button"
                    role="combobox"
                    aria-expanded={cityOpen}
                    aria-invalid={!!cityError}
                    aria-describedby={cityError ? `city-err-${uid}` : undefined}
                    disabled={citiesLoading}
                    onblur={() => (touched.city = true)}
                    class="field-input flex items-center justify-between pr-4 text-left disabled:opacity-60"
                  >
                    {#if citiesLoading}
                      <span class="inline-flex items-center gap-2 opacity-60">
                        <LoaderCircle
                          class="size-3.5 animate-spin"
                          aria-hidden="true"
                        />Завантаження…
                      </span>
                    {:else}
                      <span class={cn(!citySlug && 'text-muted-foreground')}
                        >{selectedCityLabel}</span
                      >
                      <ChevronsUpDown
                        class="size-4 shrink-0 opacity-40"
                        aria-hidden="true"
                      />
                    {/if}
                  </button>
                {/snippet}
              </Popover.Trigger>
              <Popover.Content
                class="w-[--bits-popover-anchor-width] rounded-2xl p-0"
                align="start"
                sideOffset={6}
              >
                <Command.Root>
                  <Command.Input
                    placeholder="Пошук міста…"
                    class="h-11 text-sm"
                  />
                  <Command.List class="max-h-64">
                    <Command.Empty class="py-6 text-center text-sm opacity-60"
                      >Не знайдено</Command.Empty
                    >
                    <Command.Group>
                      {#each cities as c (c.slug)}
                        <Command.Item
                          value={c.name}
                          onSelect={() => selectCity(c.slug)}
                          class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm"
                        >
                          <div
                            class="flex w-4 shrink-0 items-center justify-center"
                          >
                            {#if citySlug === c.slug}<Check
                                class="size-4 text-primary"
                                aria-hidden="true"
                              />{/if}
                          </div>
                          <span>{c.name}</span>
                        </Command.Item>
                      {/each}
                    </Command.Group>
                  </Command.List>
                </Command.Root>
              </Popover.Content>
            </Popover.Root>
            {#if cityError}<p
                id="city-err-{uid}"
                class="text-[12.5px] text-destructive"
              >
                {cityError}
              </p>{/if}
          </div>

          <!-- Пароль + Повтор -->
          <div class="flex flex-col gap-4">
            <!-- Пароль -->
            <div class="flex flex-col gap-2">
              <label
                for="password-{uid}"
                class="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground"
              >
                Пароль
              </label>
              <div class="relative">
                <input
                  id="password-{uid}"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••"
                  bind:value={password}
                  onblur={() => (touched.password = true)}
                  autocomplete="new-password"
                  minlength={8}
                  maxlength={128}
                  aria-invalid={!!passwordError}
                  aria-describedby={passwordError ? `pw-err-${uid}` : undefined}
                  class="field-input pr-10"
                  required
                />
                <button
                  type="button"
                  onclick={() => (showPassword = !showPassword)}
                  class="absolute top-1/2 right-2 flex size-8.5 -translate-y-1/2 items-center justify-center rounded-[9px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  aria-label={showPassword
                    ? 'Сховати паролі'
                    : 'Показати паролі'}
                  aria-pressed={showPassword}
                >
                  {#if showPassword}
                    <EyeOff class="size-4.5" aria-hidden="true" />
                  {:else}
                    <Eye class="size-4.5" aria-hidden="true" />
                  {/if}
                </button>
              </div>
              {#if passwordError}
                <p id="pw-err-{uid}" class="text-[12.5px] text-destructive">
                  {passwordError}
                </p>
              {/if}
            </div>

            <!-- Повторіть -->
            <div class="flex flex-col gap-2">
              <label
                for="confirm-{uid}"
                class="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground"
              >
                Повторіть пароль
              </label>
              <input
                id="confirm-{uid}"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••"
                bind:value={confirm}
                onblur={() => (touched.confirm = true)}
                autocomplete="new-password"
                minlength={8}
                maxlength={128}
                aria-invalid={!!confirmError}
                aria-describedby={confirmError
                  ? `confirm-err-${uid}`
                  : undefined}
                class="field-input"
                required
              />
              {#if confirmError}
                <p
                  id="confirm-err-{uid}"
                  class="text-[12.5px] text-destructive"
                >
                  {confirmError}
                </p>
              {/if}
            </div>
          </div>

          <!-- Індикатор сили пароля -->
          {#if password.length > 0}
            <div class="-mt-1 flex items-center gap-2.5">
              <div class="h-1.25 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  class={cn(
                    'h-full rounded-full transition-all duration-300',
                    pwStrength.score === 0
                      ? 'bg-destructive'
                      : pwStrength.score === 1
                        ? 'bg-amber-500'
                        : pwStrength.score === 2
                          ? 'bg-yellow-500'
                          : 'bg-emerald-500',
                  )}
                  style:width={`${(pwStrength.score / 3) * 100}%`}
                ></div>
              </div>
              <span
                class={cn(
                  'text-xs font-semibold tabular-nums',
                  pwStrength.score >= 2
                    ? 'text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {pwStrength.label}
              </span>
            </div>
          {/if}

          <!-- Погодження -->
          <div class="flex items-start gap-2.5">
            <Checkbox
              id="terms-{uid}"
              bind:checked={agreeTerms}
              required
              aria-describedby="terms-desc-{uid}"
              class="terms-checkbox mt-0.5 shrink-0"
            />
            <label
              for="terms-{uid}"
              id="terms-desc-{uid}"
              class="cursor-pointer text-[12.5px] leading-relaxed text-muted-foreground"
            >
              Я погоджуюсь з
              <a
                href="/terms"
                target="_blank"
                rel="noopener"
                class="font-medium text-primary hover:text-primary-hover hover:underline"
                >правилами сервісу</a
              >
              та
              <a
                href="/privacy"
                target="_blank"
                rel="noopener"
                class="font-medium text-primary hover:text-primary-hover hover:underline"
                >політикою конфіденційності</a
              >
            </label>
          </div>

          {#if serverError}{@render errBox(serverError)}{/if}

          <Button
            type="submit"
            disabled={loading || !formValid}
            aria-busy={loading}
            class="mt-1 inline-flex h-13 w-full items-center justify-center gap-2.5 rounded-[14px] bg-primary text-[15px] font-semibold tracking-[-0.01em] text-primary-foreground transition hover:-translate-y-px hover:bg-primary-hover active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            {#if loading}<LoaderCircle
                class="size-4.5 animate-spin"
                aria-hidden="true"
              />Відправляємо код…{:else}Отримати код{/if}
          </Button>

          <button
            type="button"
            onclick={backToRole}
            class="w-full rounded-sm p-1 text-center text-[12.5px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            ← Змінити роль
          </button>
        </form>
      </div>

      <!-- ─── Крок 3: OTP ─── -->
    {:else if step === 'otp'}
      <div
        in:fly={{
          x: direction * FLY_DISTANCE,
          duration: FLY_DURATION,
          easing: cubicOut,
          opacity: 0,
        }}
      >
        <div class="mb-6 text-center">
          <h1 class="text-[23px] font-bold tracking-[-0.035em] text-foreground">
            Підтвердіть email
          </h1>
          <p class="mt-1.5 text-sm text-muted-foreground">
            Ми надіслали 6-значний код на<br />
            <span class="font-semibold text-foreground">{email}</span>
          </p>
        </div>

        <form onsubmit={handleOtp} novalidate class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <label
              for="otp-{uid}"
              class="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground"
              >Код підтвердження</label
            >
            <input
              id="otp-{uid}"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength={6}
              placeholder="000000"
              bind:value={otp}
              autocomplete="one-time-code"
              aria-describedby="otp-hint-{uid}"
              class="field-input otp pl-[0.4em] text-center text-[26px] font-bold tracking-[0.4em]"
              required
            />
            <span
              id="otp-hint-{uid}"
              class="text-[12.5px] text-muted-foreground"
              >Код дійсний 10 хвилин</span
            >
          </div>

          {#if serverError}{@render errBox(serverError)}{/if}

          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            aria-busy={loading}
            class="inline-flex h-13 w-full items-center justify-center gap-2.5 rounded-[14px] bg-primary text-[15px] font-semibold tracking-[-0.01em] text-primary-foreground transition hover:-translate-y-px hover:bg-primary-hover active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            {#if loading}<LoaderCircle
                class="size-4.5 animate-spin"
                aria-hidden="true"
              />Перевіряємо…{:else}Підтвердити{/if}
          </button>

          <div class="text-center">
            {#if resendTimer > 0}
              <p class="text-[12.5px] text-muted-foreground">
                Повторний код через <span class="font-semibold text-foreground"
                  >{resendTimer}с</span
                >
              </p>
            {:else}
              <button
                type="button"
                onclick={handleResend}
                disabled={loading}
                class="rounded-sm text-[12.5px] font-semibold text-primary hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
              >
                Надіслати код повторно
              </button>
            {/if}
          </div>

          <button
            type="button"
            onclick={backToForm}
            class="w-full rounded-sm p-1 text-center text-[12.5px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            ← Змінити email
          </button>
        </form>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Тонований фон — на токенах, адаптується до теми. */
  :global(body:has(.reg-scope)) {
    background:
      radial-gradient(
        130% 100% at 12% -5%,
        color-mix(in oklch, var(--muted) 55%, var(--background)) 0%,
        transparent 50%
      ),
      radial-gradient(
        130% 100% at 100% 105%,
        color-mix(in oklch, var(--secondary) 60%, var(--background)) 0%,
        transparent 52%
      ),
      var(--background);
  }
  /* Прибираємо синє виділення на тач-пристроях лише в межах форми. */
  .reg-scope :global(button) {
    -webkit-tap-highlight-color: transparent;
  }

  .field-input {
    width: 100%;
    height: 50px;
    padding-left: 16px;
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
  .field-input.otp {
    height: 62px;
  }

  .field-input.has-prefix {
    padding-left: 58px;
  }

  .field-input::placeholder {
    color: var(--muted-foreground);
    font-weight: 400;
  }
  .field-input:focus {
    background: var(--background);
    border-color: var(--ring);
    box-shadow: 0 0 0 4px color-mix(in oklch, var(--ring) 22%, transparent);
  }
  .field-input[aria-invalid='true'] {
    border-color: var(--destructive);
  }
  .field-input.is-valid {
    border-color: color-mix(in oklch, var(--primary) 45%, transparent);
  }
  @media (prefers-reduced-motion: reduce) {
    .field-input {
      transition: none;
    }
  }

  /* Рамка чекбокса «Погодження» — темніше за замовчуванням border-input,
     щоб було видно на bg-muted фоні форми. Не займового Checkbox-компонент,
     аби не зачепити чекбокси в інших місцях застосунку. */
  .reg-scope :global(.terms-checkbox) {
    border-color: var(--foreground);
  }
  .reg-scope :global(.terms-checkbox[data-state='checked']) {
    border-color: var(--primary);
  }
</style>
