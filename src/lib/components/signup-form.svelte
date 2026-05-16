<script lang="ts" module>
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
        console.error('[register] failed to load cities:', err)
        citiesPromise = null
        throw err
      }
    })()

    return citiesPromise
  }

  // ─── Валідатори (чисті функції, тестовані) ───
  const NAME_RE = /^[\p{L}\s'-]{2,50}$/u
  const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  const PHONE_DIGITS_RE = /^\d{12}$/ // +380XXXXXXXXX → 12 цифр

  function normalizePhone(input: string): string {
    // Прибираємо все крім цифр і +
    let cleaned = input.replace(/[^\d+]/g, '')
    // Якщо починається з 0 → перетворюємо на +380
    if (/^0\d{9}$/.test(cleaned)) {
      cleaned = '+38' + cleaned
    }
    // Якщо починається з 380 без + → додаємо +
    if (/^380\d{9}$/.test(cleaned)) {
      cleaned = '+' + cleaned
    }
    return cleaned
  }

  function isValidPhone(phone: string): boolean {
    const normalized = normalizePhone(phone)
    return /^\+\d{12}$/.test(normalized)
  }

  function isValidName(name: string): boolean {
    return NAME_RE.test(name.trim())
  }

  function isValidEmail(email: string): boolean {
    const trimmed = email.trim()
    return (
      trimmed.length >= 3 && trimmed.length <= 254 && EMAIL_RE.test(trimmed)
    )
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
    if (score === 0) return { score: 1, label: 'Слабкий' }
    if (score === 1) return { score: 1, label: 'Слабкий' }
    if (score === 2) return { score: 2, label: 'Середній' }
    return { score: 3, label: 'Надійний' }
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Card from '$lib/components/ui/card/index.js'
  import * as Field from '$lib/components/ui/field/index.js'
  import * as Popover from '$lib/components/ui/popover/index.js'
  import * as Command from '$lib/components/ui/command/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
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

  let { class: className, ...restProps }: HTMLAttributes<HTMLDivElement> =
    $props()

  type Role = 'CLIENT' | 'MASTER'
  type Step = 'role' | 'form' | 'otp' | 'success'

  // ─── State ───
  let step = $state<Step>('role')
  let direction = $state<1 | -1>(1) // 1 = вперед, -1 = назад
  let role = $state<Role | null>(null)

  let name = $state('')
  let phone = $state('')
  let email = $state('')
  let citySlug = $state('')
  let password = $state('')
  let confirm = $state('')
  let agreeTerms = $state(false)
  let otp = $state('')

  // Touched-стан — показуємо помилку лише після того як юзер вийшов з поля
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
      // silent fail — буде fallback "Інше"
    } finally {
      citiesLoading = false
    }
  })

  onDestroy(() => {
    if (timerInterval) clearInterval(timerInterval)
  })

  // ─── Derived: валідація кожного поля ───
  const nameError = $derived(
    touched.name && !isValidName(name)
      ? "Введіть коректне ім'я (2-50 літер)"
      : '',
  )
  const phoneError = $derived(
    touched.phone && !isValidPhone(phone)
      ? 'Введіть телефон у форматі +380...'
      : '',
  )
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

  // ─── Чи валідна вся форма ───
  const formValid = $derived(
    isValidName(name) &&
      isValidPhone(phone) &&
      isValidEmail(email) &&
      !!citySlug &&
      password.length >= 8 &&
      password === confirm &&
      agreeTerms,
  )

  // ─── Вибраний місто (label для тригера) ───
  const selectedCityLabel = $derived(
    cities.find((c) => c.slug === citySlug)?.name ?? 'Оберіть місто',
  )

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
    if (loading) return // захист від подвійного submit

    // Помічаємо всі поля як touched, щоб показати всі помилки одразу
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
      // 1. Verify OTP
      const verifyRes = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: otp }),
      })
      const verifyData = await verifyRes.json().catch(() => ({}))
      if (!verifyRes.ok) {
        serverError = verifyData.error ?? 'Невірний код'
        return
      }

      // 2. Sign up
      const { error: signUpError } = await signUp.email({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      })
      if (signUpError) {
        serverError = signUpError.message ?? 'Помилка реєстрації'
        return
      }

      // 3. Update profile (role, phone, city)
      const cityName = cities.find((c) => c.slug === citySlug)?.name ?? null
      await fetch('/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          phone: normalizePhone(phone),
          city: cityName,
        }),
      })

      await invalidateAll()
      if (timerInterval) clearInterval(timerInterval)

      // 4. Redirect
      goto('/dashboard')
      
    } catch (err) {
      console.error('[register] otp flow failed:', err)
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

  // ─── Анімації між кроками ───
  // direction = 1 (вперед): новий крок прилітає з правого боку, старий тікає вліво
  // direction = -1 (назад): новий крок прилітає з лівого боку, старий тікає вправо
  const FLY_DURATION = 320
  const FLY_DISTANCE = 32 // px
</script>

<div class={cn('flex flex-col gap-6', className)} {...restProps}>
  <Card.Root class="overflow-hidden">
    <!-- ─── Крок 1: Роль (без змін, як просили) ─── -->
    {#if step === 'role'}
      <div
        in:fly={{
          x: direction * FLY_DISTANCE * -1,
          duration: FLY_DURATION,
          easing: cubicOut,
          opacity: 0,
        }}
      >
        <Card.Header class="text-center pb-2">
          <Card.Title
            class="text-2xl font-bold tracking-tight text-[var(--foreground)]"
          >
            Хто ви?
          </Card.Title>
        </Card.Header>

        <Card.Content>
          <div class="flex flex-col gap-4">
            {#each [{ r: 'CLIENT' as Role, icon: UserCircle2, title: 'Я замовник', desc: 'Хочу замовити' }, { r: 'MASTER' as Role, icon: BriefcaseBusiness, title: 'Я майстер', desc: 'Хочу заробляти' }] as item}
              <button
                type="button"
                onclick={() => selectRole(item.r)}
                class="group relative flex items-center gap-5 p-5 rounded-2xl border cursor-pointer transition-all duration-300 text-left
                bg-[var(--card)] border-[var(--border)]
                hover:border-[var(--primary)] hover:shadow-lg hover:shadow-[var(--primary)]/5
                active:scale-[0.98] active:duration-75"
              >
                <div
                  class="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300
                  bg-[color-mix(in_oklch,var(--primary)_10%,transparent)]
                  group-hover:bg-[var(--primary)] group-hover:text-[var(--primary-foreground)] text-[var(--primary)]"
                >
                  <item.icon size={28} strokeWidth={1.5} />
                </div>

                <div class="flex flex-col gap-0.5">
                  <p
                    class="text-base font-semibold tracking-tight text-[var(--card-foreground)]"
                  >
                    {item.title}
                  </p>
                  <p
                    class="text-sm text-[var(--muted-foreground)] transition-opacity group-hover:text-[var(--foreground)]"
                  >
                    {item.desc}
                  </p>
                </div>

                <div
                  class="ml-auto opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 text-[var(--primary)]"
                >
                  <ChevronRight size={20} />
                </div>
              </button>
            {/each}

            <div class="mt-4 text-center">
              <p class="text-sm text-[var(--muted-foreground)]">
                Вже є акаунт?
                <a
                  href="/user/login"
                  class="font-medium text-[var(--primary)] hover:underline underline-offset-4 cursor-pointer transition-all"
                >
                  Увійти
                </a>
              </p>
            </div>
          </div>
        </Card.Content>
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
        <Card.Header class="space-y-1">
          <div class="flex items-center gap-2">
            {#if role === 'CLIENT'}
              <UserCircle2 class="size-5" style="color: var(--primary)" />
            {:else}
              <BriefcaseBusiness class="size-5" style="color: var(--primary)" />
            {/if}
            <Card.Title class="text-xl">
              {role === 'CLIENT' ? 'Замовник' : 'Виконавець'}
            </Card.Title>
          </div>
          <Card.Description>Заповніть дані для реєстрації</Card.Description>
        </Card.Header>

        <Card.Content>
          <form onsubmit={handleForm} novalidate autocomplete="on">
            <Field.Group>
              <!-- Ім'я -->
              <Field.Field>
                <Field.Label for="name">Ім'я</Field.Label>
                <div class="relative">
                  <Input
                    id="name"
                    type="text"
                    placeholder="Іван Петренко"
                    bind:value={name}
                    onblur={() => (touched.name = true)}
                    autocomplete="given-name"
                    maxlength={50}
                    aria-invalid={!!nameError}
                    aria-describedby={nameError ? 'name-error' : undefined}
                    class="pr-9"
                    required
                  />
                  {#if touched.name && isValidName(name)}
                    <CheckCircle2
                      class="absolute right-3 top-1/2 -translate-y-1/2 size-4"
                      style="color: var(--primary)"
                    />
                  {:else if nameError}
                    <AlertCircle
                      class="absolute right-3 top-1/2 -translate-y-1/2 size-4"
                      style="color: var(--destructive)"
                    />
                  {/if}
                </div>
                {#if nameError}
                  <Field.Description id="name-error" class="text-destructive">
                    {nameError}
                  </Field.Description>
                {/if}
              </Field.Field>

              <!-- Телефон -->
              <Field.Field>
                <Field.Label for="phone">Телефон</Field.Label>
                <div class="relative">
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+380 67 123 45 67"
                    bind:value={phone}
                    onblur={() => (touched.phone = true)}
                    autocomplete="tel"
                    maxlength={20}
                    aria-invalid={!!phoneError}
                    aria-describedby={phoneError ? 'phone-error' : undefined}
                    class="pr-9"
                    required
                  />
                  {#if touched.phone && isValidPhone(phone)}
                    <CheckCircle2
                      class="absolute right-3 top-1/2 -translate-y-1/2 size-4"
                      style="color: var(--primary)"
                    />
                  {:else if phoneError}
                    <AlertCircle
                      class="absolute right-3 top-1/2 -translate-y-1/2 size-4"
                      style="color: var(--destructive)"
                    />
                  {/if}
                </div>
                {#if phoneError}
                  <Field.Description id="phone-error" class="text-destructive">
                    {phoneError}
                  </Field.Description>
                {/if}
              </Field.Field>

              <!-- Email -->
              <Field.Field>
                <Field.Label for="email">Email</Field.Label>
                <div class="relative">
                  <Input
                    id="email"
                    type="email"
                    placeholder="ivan@example.com"
                    bind:value={email}
                    onblur={() => (touched.email = true)}
                    autocomplete="email"
                    maxlength={254}
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? 'email-error' : undefined}
                    class="pr-9"
                    required
                  />
                  {#if touched.email && isValidEmail(email)}
                    <CheckCircle2
                      class="absolute right-3 top-1/2 -translate-y-1/2 size-4"
                      style="color: var(--primary)"
                    />
                  {:else if emailError}
                    <AlertCircle
                      class="absolute right-3 top-1/2 -translate-y-1/2 size-4"
                      style="color: var(--destructive)"
                    />
                  {/if}
                </div>
                {#if emailError}
                  <Field.Description id="email-error" class="text-destructive">
                    {emailError}
                  </Field.Description>
                {/if}
              </Field.Field>

              <!-- Місто -->
              <Field.Field>
                <Field.Label for="city">Місто</Field.Label>
                <Popover.Root bind:open={cityOpen}>
                  <Popover.Trigger>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        bind:ref={cityTriggerRef}
                        variant="outline"
                        role="combobox"
                        aria-expanded={cityOpen}
                        aria-invalid={!!cityError}
                        disabled={citiesLoading}
                        onblur={() => (touched.city = true)}
                        class="w-full h-9 justify-between rounded-lg px-3 font-normal text-sm cursor-pointer"
                      >
                        {#if citiesLoading}
                          <span
                            class="inline-flex items-center gap-2 opacity-60"
                          >
                            <LoaderCircle class="size-3.5 animate-spin" />
                            Завантаження…
                          </span>
                        {:else}
                          <span class:opacity-50={!citySlug}>
                            {selectedCityLabel}
                          </span>
                          <ChevronsUpDown class="size-4 opacity-40 shrink-0" />
                        {/if}
                      </Button>
                    {/snippet}
                  </Popover.Trigger>
                  <Popover.Content
                    class="w-[--bits-popover-anchor-width] p-0 rounded-lg"
                    align="start"
                    sideOffset={4}
                  >
                    <Command.Root>
                      <Command.Input
                        placeholder="Пошук міста…"
                        class="h-10 text-sm"
                      />
                      <Command.List class="max-h-64">
                        <Command.Empty
                          class="py-6 text-center text-sm opacity-60"
                        >
                          Не знайдено
                        </Command.Empty>
                        <Command.Group>
                          {#each cities as c (c.slug)}
                            <Command.Item
                              value={c.name}
                              onSelect={() => selectCity(c.slug)}
                              class="flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm"
                            >
                              <div
                                class="w-4 flex items-center justify-center shrink-0"
                              >
                                {#if citySlug === c.slug}
                                  <Check
                                    class="size-4"
                                    style="color: var(--primary)"
                                  />
                                {/if}
                              </div>
                              <span>{c.name}</span>
                            </Command.Item>
                          {/each}
                        </Command.Group>
                      </Command.List>
                    </Command.Root>
                  </Popover.Content>
                </Popover.Root>
                {#if cityError}
                  <Field.Description class="text-destructive">
                    {cityError}
                  </Field.Description>
                {/if}
              </Field.Field>

              <!-- Пароль + Повтор -->
              <div class="grid grid-cols-2 gap-3">
                <Field.Field>
                  <Field.Label for="password">Пароль</Field.Label>
                  <div class="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      bind:value={password}
                      onblur={() => (touched.password = true)}
                      autocomplete="new-password"
                      minlength={8}
                      maxlength={128}
                      aria-invalid={!!passwordError}
                      class="pr-9"
                      required
                    />
                    <button
                      type="button"
                      onclick={() => (showPassword = !showPassword)}
                      class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded cursor-pointer hover:opacity-70"
                      aria-label={showPassword ? 'Сховати' : 'Показати'}
                      tabindex={-1}
                    >
                      {#if showPassword}
                        <EyeOff class="size-4 opacity-60" />
                      {:else}
                        <Eye class="size-4 opacity-60" />
                      {/if}
                    </button>
                  </div>
                  {#if passwordError}
                    <Field.Description class="text-destructive">
                      {passwordError}
                    </Field.Description>
                  {/if}
                </Field.Field>

                <Field.Field>
                  <Field.Label for="confirm">Повторіть</Field.Label>
                  <Input
                    id="confirm"
                    type={showPassword ? 'text' : 'password'}
                    bind:value={confirm}
                    onblur={() => (touched.confirm = true)}
                    autocomplete="new-password"
                    minlength={8}
                    maxlength={128}
                    aria-invalid={!!confirmError}
                    required
                  />
                  {#if confirmError}
                    <Field.Description class="text-destructive">
                      {confirmError}
                    </Field.Description>
                  {/if}
                </Field.Field>
              </div>

              <!-- Індикатор сили пароля -->
              {#if password.length > 0}
                <div class="flex items-center gap-2 -mt-2">
                  <div
                    class="flex-1 h-1 rounded-full overflow-hidden"
                    style="background-color: color-mix(in oklch, var(--foreground) 8%, transparent)"
                  >
                    <div
                      class="h-full transition-all duration-300"
                      style="width: {(pwStrength.score / 3) * 100}%;
                             background-color: {pwStrength.score === 0
                        ? 'var(--destructive)'
                        : pwStrength.score === 1
                          ? '#f59e0b'
                          : pwStrength.score === 2
                            ? '#eab308'
                            : '#10b981'}"
                    ></div>
                  </div>
                  <span
                    class="text-xs font-medium tabular-nums"
                    style="color: {pwStrength.score >= 2
                      ? 'var(--foreground)'
                      : 'var(--muted-foreground)'}"
                  >
                    {pwStrength.label}
                  </span>
                </div>
              {/if}

              <!-- Погодження -->
              <div class="flex items-start gap-2">
                <input
                  id="terms"
                  type="checkbox"
                  bind:checked={agreeTerms}
                  class="mt-0.5 w-4 h-4 rounded cursor-pointer accent-primary shrink-0"
                />
                <label
                  for="terms"
                  class="text-xs cursor-pointer leading-relaxed"
                  style="color: var(--muted-foreground)"
                >
                  Я погоджуюсь з
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener"
                    class="hover:underline"
                    style="color: var(--primary)">правилами сервісу</a
                  >
                  та
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener"
                    class="hover:underline"
                    style="color: var(--primary)">політикою конфіденційності</a
                  >
                </label>
              </div>

              {#if serverError}
                <div
                  class="flex items-start gap-2 p-3 rounded-lg text-sm"
                  style="background-color: color-mix(in oklch, var(--destructive) 8%, transparent);
                         color: var(--destructive);
                         border: 1px solid color-mix(in oklch, var(--destructive) 25%, transparent)"
                  role="alert"
                >
                  <AlertCircle class="size-4 shrink-0 mt-0.5" />
                  <span>{serverError}</span>
                </div>
              {/if}

              <Button
                type="submit"
                disabled={loading || !formValid}
                class="w-full h-11 rounded-lg cursor-pointer disabled:cursor-not-allowed"
              >
                {#if loading}
                  <LoaderCircle class="size-4 animate-spin mr-2" />
                  Відправляємо код…
                {:else}
                  Отримати код
                {/if}
              </Button>

              <button
                type="button"
                onclick={backToRole}
                class="text-xs text-center cursor-pointer hover:opacity-70 w-full"
                style="color: var(--muted-foreground)"
              >
                ← Змінити роль
              </button>
            </Field.Group>
          </form>
        </Card.Content>
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
        <Card.Header class="text-center">
          <Card.Title class="text-xl">Підтвердіть email</Card.Title>
          <Card.Description>
            Ми надіслали 6-значний код на<br />
            <span class="font-medium" style="color: var(--foreground)">
              {email}
            </span>
          </Card.Description>
        </Card.Header>

        <Card.Content>
          <form onsubmit={handleOtp} novalidate>
            <Field.Group>
              <Field.Field>
                <Field.Label for="otp">Код підтвердження</Field.Label>
                <Input
                  id="otp"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  maxlength={6}
                  placeholder="000000"
                  bind:value={otp}
                  autocomplete="one-time-code"
                  class="text-center text-2xl font-bold tracking-widest h-14"
                  required
                />
                <Field.Description>Код дійсний 10 хвилин</Field.Description>
              </Field.Field>

              {#if serverError}
                <div
                  class="flex items-start gap-2 p-3 rounded-lg text-sm"
                  style="background-color: color-mix(in oklch, var(--destructive) 8%, transparent);
                         color: var(--destructive);
                         border: 1px solid color-mix(in oklch, var(--destructive) 25%, transparent)"
                  role="alert"
                >
                  <AlertCircle class="size-4 shrink-0 mt-0.5" />
                  <span>{serverError}</span>
                </div>
              {/if}

              <Button
                type="submit"
                disabled={loading || otp.length !== 6}
                class="w-full h-11 rounded-lg cursor-pointer disabled:cursor-not-allowed"
              >
                {#if loading}
                  <LoaderCircle class="size-4 animate-spin mr-2" />
                  Перевіряємо…
                {:else}
                  Підтвердити
                {/if}
              </Button>

              <div class="text-center">
                {#if resendTimer > 0}
                  <p class="text-xs" style="color: var(--muted-foreground)">
                    Повторний код через {resendTimer}с
                  </p>
                {:else}
                  <button
                    type="button"
                    onclick={handleResend}
                    disabled={loading}
                    class="text-xs cursor-pointer hover:opacity-70 disabled:opacity-50"
                    style="color: var(--primary)"
                  >
                    Надіслати код повторно
                  </button>
                {/if}
              </div>

              <button
                type="button"
                onclick={backToForm}
                class="text-xs text-center cursor-pointer hover:opacity-70 w-full"
                style="color: var(--muted-foreground)"
              >
                ← Змінити email
              </button>
            </Field.Group>
          </form>
        </Card.Content>
      </div>
    {/if}
  </Card.Root>
</div>

<style>
  /* Прибираємо синє виділення на мобайлі */
  :global(button) {
    -webkit-tap-highlight-color: transparent;
  }
</style>
