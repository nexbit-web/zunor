<script lang="ts">
  import { cn } from '$lib/utils.js'
  import type { HTMLFormAttributes } from 'svelte/elements'
  import { signUp, signIn } from '$lib/auth-client'
  import { goto, invalidateAll } from '$app/navigation'
  import { dev } from '$app/environment'
  import { Eye, EyeOff } from 'lucide-svelte'
  import { Button } from './ui/button'
  import { Input } from './ui/input'
  import { Spinner } from './ui/spinner'
  import * as Field from './ui/field'
  import toast from 'svelte-hot-french-toast'

  let { class: className, ...restProps }: HTMLFormAttributes = $props()
  const id = $props.id()

  // ─── State ───
  let name = $state('')
  let email = $state('')
  let password = $state('')
  let confirmPassword = $state('')
  let loading = $state(false)
  let googleLoading = $state(false)
  let serverError = $state('')
  let showPassword = $state(false)
  let touched = $state({
    name: false,
    email: false,
    password: false,
    confirm: false,
  })

  // ─── Валідація (UX; авторитет — сервер) ───
  const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  const isValidName = (n: string) =>
    n.trim().length >= 2 && n.trim().length <= 50
  const isValidEmail = (e: string) => {
    const t = e.trim()
    return t.length >= 3 && t.length <= 254 && EMAIL_RE.test(t)
  }
  const isValidPassword = (p: string) => p.length >= 8 && p.length <= 128

  const nameError = $derived(
    touched.name && !isValidName(name) ? "Вкажіть ім'я (2–50 символів)" : '',
  )
  const emailError = $derived(
    touched.email && !isValidEmail(email) ? 'Невірний формат email' : '',
  )
  const passwordError = $derived(
    touched.password && !isValidPassword(password) ? 'Мінімум 8 символів' : '',
  )
  const confirmError = $derived(
    touched.confirm && confirmPassword !== password
      ? 'Паролі не збігаються'
      : '',
  )
  const formValid = $derived(
    isValidName(name) &&
      isValidEmail(email) &&
      isValidPassword(password) &&
      confirmPassword === password,
  )

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading) return
    touched = { name: true, email: true, password: true, confirm: true }
    if (!formValid) {
      serverError = 'Перевірте правильність заповнення полів'
      return
    }
    loading = true
    serverError = ''
    try {
      const { error: err } = await signUp.email({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      })
      if (err) {
        if (err.status === 422) serverError = 'Акаунт із таким email вже існує'
        else serverError = err.message ?? 'Помилка реєстрації'
        return
      }
      await invalidateAll()
      // onboarded=false → замок у hooks одразу поведе на /dashboard/onboarding.
      goto('/dashboard')
      toast('Акаунт створено!', { icon: '🎉' })
    } catch (err) {
      if (dev) console.error('[register] failed:', err)
      serverError = "Помилка з'єднання. Перевірте інтернет."
    } finally {
      loading = false
    }
  }

  async function handleGoogle() {
    if (googleLoading) return
    googleLoading = true
    serverError = ''
    try {
      // Після Google-входу better-auth редіректить на callbackURL.
      // Ведемо на /dashboard — замок перекине на онбординг, якщо профіль пустий.
      await signIn.social({ provider: 'google', callbackURL: '/dashboard' })
    } catch (err) {
      if (dev) console.error('[register] google failed:', err)
      serverError = 'Не вдалося увійти через Google'
      googleLoading = false
    }
    // Не скидаємо googleLoading у finally — при успіху йде редірект на Google.
  }
</script>

<form
  class={cn('flex flex-col gap-6', className)}
  onsubmit={handleSubmit}
  novalidate
  autocomplete="on"
  {...restProps}
>
  <Field.Group>
    <div class="flex flex-col items-center gap-1 text-center">
      <h1 class="text-2xl font-bold">Створіть акаунт</h1>
      <p class="text-sm text-balance text-muted-foreground">
        Заповніть форму, щоб приєднатися до Zunor
      </p>
    </div>

    <!-- Ім'я -->
    <Field.Field>
      <Field.Label for="name-{id}">Ім'я</Field.Label>
      <Input
        id="name-{id}"
        type="text"
        placeholder="Іван Петренко"
        bind:value={name}
        onblur={() => (touched.name = true)}
        autocomplete="name"
        autocapitalize="words"
        maxlength={50}
        aria-invalid={!!nameError}
        aria-describedby={nameError ? `name-err-${id}` : undefined}
        required
      />
      {#if nameError}
        <Field.Error id="name-err-{id}">{nameError}</Field.Error>
      {/if}
    </Field.Field>

    <!-- Email -->
    <Field.Field>
      <Field.Label for="email-{id}">Email</Field.Label>
      <Input
        id="email-{id}"
        type="email"
        inputmode="email"
        autocapitalize="none"
        autocomplete="email"
        spellcheck="false"
        placeholder="ivan@example.com"
        bind:value={email}
        onblur={() => (touched.email = true)}
        maxlength={254}
        aria-invalid={!!emailError}
        aria-describedby={emailError ? `email-err-${id}` : undefined}
        required
      />
      {#if emailError}
        <Field.Error id="email-err-{id}">{emailError}</Field.Error>
      {:else}
        <Field.Description>Використаємо для входу та звʼязку.</Field.Description
        >
      {/if}
    </Field.Field>

    <!-- Пароль -->
    <Field.Field>
      <Field.Label for="password-{id}">Пароль</Field.Label>
      <div class="relative">
        <Input
          id="password-{id}"
          type={showPassword ? 'text' : 'password'}
          placeholder="Мінімум 8 символів"
          bind:value={password}
          onblur={() => (touched.password = true)}
          autocomplete="new-password"
          maxlength={128}
          aria-invalid={!!passwordError}
          aria-describedby={passwordError ? `pw-err-${id}` : undefined}
          class="pr-10"
          required
        />
        <button
          type="button"
          onclick={() => (showPassword = !showPassword)}
          class="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={showPassword ? 'Сховати пароль' : 'Показати пароль'}
          aria-pressed={showPassword}
        >
          {#if showPassword}
            <EyeOff class="size-4" aria-hidden="true" />
          {:else}
            <Eye class="size-4" aria-hidden="true" />
          {/if}
        </button>
      </div>
      {#if passwordError}
        <Field.Error id="pw-err-{id}">{passwordError}</Field.Error>
      {/if}
    </Field.Field>

    <!-- Підтвердження пароля -->
    <Field.Field>
      <Field.Label for="confirm-{id}">Підтвердіть пароль</Field.Label>
      <div class="relative">
        <Input
          id="confirm-{id}"
          type={showPassword ? 'text' : 'password'}
          placeholder="Повторіть пароль"
          bind:value={confirmPassword}
          onblur={() => (touched.confirm = true)}
          autocomplete="new-password"
          maxlength={128}
          aria-invalid={!!confirmError}
          aria-describedby={confirmError ? `confirm-err-${id}` : undefined}
          class="pr-10"
          required
        />
        
      </div>
      {#if confirmError}
        <Field.Error id="confirm-err-{id}">{confirmError}</Field.Error>
      {/if}
    </Field.Field>

    <!-- Server error -->
    {#if serverError}
      <Field.Field>
        <Field.Error role="alert">{serverError}</Field.Error>
      </Field.Field>
    {/if}

    <!-- Submit -->
    <Field.Field>
      <Button
        class="relative py-6"
        type="submit"
        disabled={loading || googleLoading || !formValid}
        aria-busy={loading}
      >
        <span>{loading ? 'Створення...' : 'Створити акаунт'}</span>
        {#if loading}
          <Spinner class="absolute right-4 animate-spin" aria-hidden="true" />
        {/if}
      </Button>
    </Field.Field>

    <Field.Separator>або</Field.Separator>

    <!-- Google -->
    <Field.Field>
      <Button
        class="relative py-6"
        variant="outline"
        type="button"
        onclick={handleGoogle}
        disabled={loading || googleLoading}
        aria-busy={googleLoading}
      >
        {#if googleLoading}
          <Spinner class="animate-spin" aria-hidden="true" />
          Переходимо до Google...
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            class="size-4.5"
            aria-hidden="true"
          >
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
              fill="#EA4335"
            />
          </svg>
          Продовжити з Google
        {/if}
      </Button>

      <Field.Description class="text-center">
        Вже маєте акаунт?
        <a href="/user/login" class="underline underline-offset-4">Увійти</a>
      </Field.Description>
    </Field.Field>
  </Field.Group>
</form>
