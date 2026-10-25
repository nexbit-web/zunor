<script lang="ts">
  // Форма реєстрації — та сама подача, що й вхід, і той самий склад, що в
  // ClickUp: Google зверху, під «або» — імʼя, пошта, пароль і кнопка.
  // Заголовок, посилання на вхід і юридичний рядок унизу малює AuthShell.
  //
  // Поля «Повторіть пароль» немає, як і в ClickUp: перемикач «показати»
  // дає побачити введене, а друге поле подвоювало роботу заради
  // перевірки, яку він робить краще.
  import { cn } from '$lib/utils.js'
  import type { HTMLFormAttributes } from 'svelte/elements'
  import { signUp, signIn } from '$lib/auth-client'
  import { goto } from '$app/navigation'
  import { dev } from '$app/environment'
  import { Button } from './ui/button'
  import { Input } from './ui/input'
  import { Spinner } from './ui/spinner'
  import FieldError from './forms/field-error.svelte'
  import GoogleButton from './auth/google-button.svelte'
  import PasswordInput from './auth/password-input.svelte'

  let { class: className, ...restProps }: HTMLFormAttributes = $props()
  const id = $props.id()

  // ─── State ───
  let name = $state('')
  let email = $state('')
  let password = $state('')
  let loading = $state(false)
  let googleLoading = $state(false)
  let serverError = $state('')
  let touched = $state({
    name: false,
    email: false,
    password: false,
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
  const formValid = $derived(
    isValidName(name) && isValidEmail(email) && isValidPassword(password),
  )

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading || googleLoading) return

    // Перевірка спрацьовує на натиск, а не на blur: кнопка лишається
    // активною, і людина дізнається про проблему з конкретного поля,
    // а не з сірого прямокутника, який мовчки не натискається.
    touched = { name: true, email: true, password: true }
    if (!formValid) return

    loading = true
    serverError = ''

    const normalizedEmail = email.trim().toLowerCase()

    try {
      const { error: err } = await signUp.email({
        name: name.trim(),
        email: normalizedEmail,
        password,
      })
      if (err) {
        if (err.status === 422) serverError = 'Акаунт із таким email вже існує'
        else if (err.status === 429)
          serverError = 'Забагато спроб. Спробуйте пізніше.'
        else serverError = 'Не вдалося створити акаунт'
        return
      }
      await goto(
        `/user/verify-email?email=${encodeURIComponent(normalizedEmail)}`,
      )
    } catch (err) {
      if (dev) console.error('[register] failed:', err)
      serverError = "Помилка з'єднання. Перевірте інтернет."
    } finally {
      loading = false
    }
  }

  async function handleGoogle() {
    if (loading || googleLoading) return
    googleLoading = true
    serverError = ''
    try {
      await signIn.social({
        provider: 'google',
        callbackURL: '/dashboard',
        // Куди Google поверне при відмові юзера або помилці провайдера.
        errorCallbackURL: '/user/login?error=oauth',
      })
    } catch (err) {
      if (dev) console.error('[register] google failed:', err)
      serverError = 'Не вдалося увійти через Google'
      googleLoading = false
    }
    // Не скидаємо googleLoading у finally — при успіху йде редірект на Google.
  }
</script>

<form
  class={cn('flex flex-col', className)}
  onsubmit={handleSubmit}
  novalidate
  autocomplete="on"
  {...restProps}
>
  <GoogleButton
    onclick={handleGoogle}
    loading={googleLoading}
    disabled={loading}
  />

  <div
    class="my-4 flex items-center gap-3 text-[13px] leading-5 text-muted-foreground"
    role="separator"
  >
    <span class="h-px flex-1 bg-border"></span>
    або
    <span class="h-px flex-1 bg-border"></span>
  </div>

  <!-- Підпис полів — у плейсхолдері, як у ClickUp; aria-label дублює
       його для скрінрідера, бо плейсхолдер підписом не вважається. -->
  <div class="flex flex-col gap-3">
    <div>
      <Input
        id="name-{id}"
        type="text"
        placeholder="Повне ім'я"
        aria-label="Повне ім'я"
        bind:value={name}
        autocomplete="name"
        autocapitalize="words"
        maxlength={50}
        aria-invalid={!!nameError}
        aria-describedby={nameError ? `name-${id}-error` : undefined}
        class="h-9 rounded-[8px]"
        required
      />
      <FieldError id="name-{id}-error" text={nameError} />
    </div>

    <div>
      <Input
        id="email-{id}"
        type="email"
        inputmode="email"
        autocapitalize="none"
        autocomplete="email"
        spellcheck="false"
        placeholder="Робоча електронна пошта"
        aria-label="Робоча електронна пошта"
        bind:value={email}
        maxlength={254}
        aria-invalid={!!emailError}
        aria-describedby={emailError ? `email-${id}-error` : undefined}
        class="h-9 rounded-[8px]"
        required
      />
      <FieldError id="email-{id}-error" text={emailError} />
    </div>

    <div>
      <PasswordInput
        id="password-{id}"
        bind:value={password}
        autocomplete="new-password"
        maxlength={128}
        errorId={passwordError ? `password-${id}-error` : undefined}
      />
      <FieldError id="password-{id}-error" text={passwordError} />
    </div>

    {#if serverError}
      <div class="flex justify-center">
        <FieldError text={serverError} />
      </div>
    {/if}

    <Button
      variant="primary"
      size="lg"
      class="relative w-full"
      type="submit"
      disabled={loading || googleLoading}
      aria-busy={loading}
    >
      {#if loading}
        <Spinner class="animate-spin" aria-hidden="true" />
        <span class="sr-only">Створення...</span>
      {:else}
        <span>Зареєструватися з електронною поштою</span>
      {/if}
    </Button>
  </div>
</form>
