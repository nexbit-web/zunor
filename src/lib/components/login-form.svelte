<script lang="ts">
  import { cn } from '$lib/utils.js'
  import type { HTMLFormAttributes } from 'svelte/elements'
  import { signIn } from '$lib/auth-client'
  import { goto, invalidateAll } from '$app/navigation'
  import { dev } from '$app/environment'
  import { Eye, EyeOff, Mail, ArrowLeft } from 'lucide-svelte'
  import { Button } from './ui/button'
  import { Input } from './ui/input'
  import { Spinner } from './ui/spinner'
  import {
    FieldGroup,
    Field,
    FieldLabel,
    FieldError,
    FieldDescription,
    FieldSeparator,
  } from './ui/field'
  import toast from 'svelte-hot-french-toast'
  import { page } from '$app/state'
  import { safeRedirectTarget } from '$lib/utils/redirect'
  import { WaveHelloIcon } from '$lib/components/icons'
  let { class: className, ...restProps }: HTMLFormAttributes = $props()
  const id = $props.id()

  // ─── State ───
  // showEmailForm керує лише видимістю: поля ЗАВЖДИ в DOM.
  // Якщо монтувати їх умовно, менеджер паролів не бачить форму при
  // завантаженні й не пропонує автозаповнення — класична поломка
  // цього патерну.
  let showEmailForm = $state(false)

  let email = $state('')
  let password = $state('')
  let loading = $state(false)
  let googleLoading = $state(false)
  let serverError = $state('')
  let showPassword = $state(false)
  let touched = $state({ email: false, password: false })

  // ─── Валідація (UX-рівень; авторитет — сервер) ───
  const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  function isValidEmail(e: string): boolean {
    const t = e.trim()
    return t.length >= 3 && t.length <= 254 && EMAIL_RE.test(t)
  }

  const emailError = $derived(
    touched.email && !isValidEmail(email) ? 'Невірний формат email' : '',
  )
  const passwordError = $derived(
    touched.password && password.length < 1 ? 'Введіть пароль' : '',
  )
  const formValid = $derived(isValidEmail(email) && password.length > 0)

  // Помилки з URL: banned ставить guardHandle, oauth — errorCallbackURL нижче.
  const urlError = $derived(page.url.searchParams.get('error'))

  function openEmailForm(): void {
    showEmailForm = true
    // Фокус після кадру: до цього поле ще display:none і не фокусується.
    // Шукаємо через DOM, а не bind:ref — компонент Input із shadcn
    // не оголошує ref як $bindable, і bind: на ньому падає при гідратації.
    requestAnimationFrame(() => {
      const el = document.getElementById(`email-${id}`)
      if (el instanceof HTMLInputElement) el.focus()
    })
  }

  function closeEmailForm(): void {
    showEmailForm = false
    serverError = ''
    touched = { email: false, password: false }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading || googleLoading) return

    // Сабміт можливий і з прихованої форми — через автозаповнення
    // та Enter. Тому спершу розкриваємо, щоб людина бачила, що вводить.
    if (!showEmailForm) {
      openEmailForm()
      return
    }

    touched = { email: true, password: true }
    if (!formValid) {
      serverError = 'Перевірте правильність заповнення полів'
      return
    }
    loading = true
    serverError = ''
    const normalizedEmail = email.trim().toLowerCase()

    try {
      const { data, error: err } = await signIn.email({
        email: normalizedEmail,
        password,
      })

      if (err) {
        // 403 = EMAIL_NOT_VERIFIED. Не залишаємо юзера в глухому куті:
        // better-auth уже надіслав новий код, ведемо його вводити.
        if (err.status === 403) {
          await goto(
            `/user/verify-email?email=${encodeURIComponent(normalizedEmail)}`,
          )
          return
        }
        if (err.status === 429)
          serverError = 'Забагато спроб. Спробуйте через хвилину.'
        // Однакове формулювання на «немає юзера» і «невірний пароль» —
        // інакше форма стає оракулом існування акаунтів.
        else serverError = 'Невірний email або пароль'
        return
      }

      // Тост ДО навігації: invalidateAll перемонтовує кореневий layout
      // разом із <Toaster>, і черга тостів обнуляється.
      const name = data?.user?.name ?? ''
      toast(name ? `Вітаємо, ${name}!` : 'Вітаємо!', { icon: WaveHelloIcon })

      await invalidateAll()
      await goto(safeRedirectTarget(page.url.searchParams.get('redirectTo')))
    } catch (err) {
      if (dev) console.error('[login] failed:', err)
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
      // redirectTo прогоняємо через safeRedirectTarget: інакше посилання
      // /user/login?redirectTo=//evil.com відправило б юзера на чужий домен
      // одразу після успішного входу, вже з живою сесією.
      const callbackURL = safeRedirectTarget(
        page.url.searchParams.get('redirectTo'),
      )

      await signIn.social({
        provider: 'google',
        callbackURL,
        errorCallbackURL: '/user/login?error=oauth',
      })
      // Успіх = редірект на Google, код нижче не виконується.
    } catch (err) {
      if (dev) console.error('[login] google failed:', err)
      serverError = 'Не вдалося увійти через Google'
      googleLoading = false
    }
    // googleLoading НЕ скидаємо у finally: при успіху сторінка вже йде
    // на Google, і скидання спінера показало б активну кнопку на мить.
  }
</script>

<form
  class={cn('flex flex-col gap-6', className)}
  onsubmit={handleSubmit}
  novalidate
  autocomplete="on"
  {...restProps}
>
  <FieldGroup>
    <div class="flex flex-col items-center gap-1 text-center">
      <h1 class="text-2xl font-bold">Вхід до акаунту</h1>
      <p class="text-sm text-balance text-muted-foreground">
        {showEmailForm
          ? 'Введіть свою електронну адресу та пароль'
          : 'Оберіть спосіб входу'}
      </p>
    </div>

    <!-- Помилки з URL -->
    {#if urlError === 'banned'}
      <Field>
        <FieldError role="alert">
          Доступ до акаунта обмежено. Напишіть у підтримку.
        </FieldError>
      </Field>
    {:else if urlError === 'oauth'}
      <Field>
        <FieldError role="alert">
          Не вдалося увійти через Google. Спробуйте ще раз.
        </FieldError>
      </Field>
    {/if}

    <!-- ─── Крок 1: вибір способу ─── -->
    {#if !showEmailForm}
      <Field>
        <Button
          class="relative py-6"
          variant="outline"
          type="button"
          onclick={handleGoogle}
          disabled={googleLoading}
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
            Увійти через Google
          {/if}
        </Button>
      </Field>

      <Field>
        <Button
          class="py-6"
          variant="outline"
          type="button"
          onclick={openEmailForm}
          disabled={googleLoading}
        >
          <Mail class="size-4.5" aria-hidden="true" />
          Увійти через email
        </Button>
      </Field>
    {/if}

    <!-- ─── Крок 2: форма email ───
         hidden замість {#if}: поля лишаються в DOM, тож менеджер паролів
         бачить їх при завантаженні сторінки й пропонує автозаповнення. -->
    <div class={showEmailForm ? 'flex flex-col gap-6' : 'hidden'}>
      <Field>
        <FieldLabel for="email-{id}">Email</FieldLabel>
        <Input
          id="email-{id}"
          type="email"
          class="py-5"
          inputmode="email"
          autocapitalize="none"
          autocomplete="email"
          spellcheck="false"
          placeholder="name@example.com"
          bind:value={email}
          onblur={() => (touched.email = true)}
          maxlength={254}
          aria-invalid={!!emailError}
          aria-describedby={emailError ? `email-err-${id}` : undefined}
          required
        />
        {#if emailError}
          <FieldError id="email-err-{id}">{emailError}</FieldError>
        {/if}
      </Field>

      <Field>
        <div class="flex items-center">
          <FieldLabel for="password-{id}">Пароль</FieldLabel>
          <a
            href="/user/forgot"
            class="ms-auto text-sm underline-offset-4 hover:underline"
          >
            Забули пароль?
          </a>
        </div>
        <div class="relative">
          <Input
            id="password-{id}"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••••"
            bind:value={password}
            onblur={() => (touched.password = true)}
            autocomplete="current-password"
            aria-invalid={!!passwordError}
            aria-describedby={passwordError ? `pw-err-${id}` : undefined}
            class="py-5 pr-10"
            required
          />
          <button
            type="button"
            onclick={() => (showPassword = !showPassword)}
            class="absolute top-1/2 right-0.5 mr-0.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
          <FieldError id="pw-err-{id}">{passwordError}</FieldError>
        {/if}
      </Field>

      {#if serverError}
        <Field>
          <FieldError role="alert">{serverError}</FieldError>
        </Field>
      {/if}

      <Field>
        <Button
          class="relative py-6"
          type="submit"
          disabled={loading || !formValid}
          aria-busy={loading}
        >
          <span>{loading ? 'Зачекайте...' : 'Увійти'}</span>
          {#if loading}
            <Spinner class="absolute right-4 animate-spin" aria-hidden="true" />
          {/if}
        </Button>
      </Field>

      <Field>
        <button
          type="button"
          onclick={closeEmailForm}
          class="mx-auto inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowLeft class="size-3.5" aria-hidden="true" />
          Інші способи входу
        </button>
      </Field>
    </div>

    <!-- Помилка Google показується й на кроці вибору -->
    {#if serverError && !showEmailForm}
      <Field>
        <FieldError role="alert">{serverError}</FieldError>
      </Field>
    {/if}

    <FieldSeparator />

    <FieldDescription class="text-center">
      Немає облікового запису?
      <a
        href="/user/register"
        class="font-medium text-foreground underline-offset-4 hover:underline"
      >
        Зареєструватися
      </a>
    </FieldDescription>
  </FieldGroup>

  <p
    class="-mt-2 text-center text-xs leading-relaxed text-balance text-muted-foreground/80"
  >
    Продовжуючи, ви погоджуєтесь із
    <a
      href="/terms"
      target="_blank"
      rel="noopener noreferrer"
      class="underline underline-offset-4 transition-colors hover:text-foreground"
    >
      Умовами використання
    </a>
    та
    <a
      href="/privacy"
      target="_blank"
      rel="noopener noreferrer"
      class="underline underline-offset-4 transition-colors hover:text-foreground"
    >
      Політикою конфіденційності
    </a>
  </p>
</form>
