<script lang="ts">
  import { cn } from '$lib/utils.js'
  import type { HTMLFormAttributes } from 'svelte/elements'
  import { signIn } from '$lib/auth-client'
  import { goto, invalidateAll } from '$app/navigation'
  import { dev } from '$app/environment'
  import { Eye, EyeOff } from 'lucide-svelte'
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

  let { class: className, ...restProps }: HTMLFormAttributes = $props()
  const id = $props.id()

  // ─── State ───
  let email = $state('')
  let password = $state('')
  let loading = $state(false)
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

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading) return
    touched = { email: true, password: true }
    if (!formValid) {
      serverError = 'Перевірте правильність заповнення полів'
      return
    }
    loading = true
    serverError = ''
    try {
      const { data, error: err } = await signIn.email({
        email: email.trim().toLowerCase(),
        password,
      })
      if (err) {
        if (err.status === 403) serverError = 'Підтвердіть email перед входом'
        else if (err.status === 429)
          serverError = 'Забагато спроб. Спробуйте через хвилину.'
        else serverError = 'Невірний email або пароль'
        return
      }
      await invalidateAll()
      // Гість, якого guard відправив на логін, повертається туди, куди йшов.
      // safeRedirectTarget відсікає open-redirect (//evil.com) і auth-петлі.
      goto(safeRedirectTarget(page.url.searchParams.get('redirectTo')))

      const name = data?.user?.name ?? ''
      toast(name ? `Вітаємо, ${name}!` : 'Вітаємо!', { icon: '😊' })
    } catch (err) {
      if (dev) console.error('[login] failed:', err)
      serverError = "Помилка з'єднання. Перевірте інтернет."
    } finally {
      loading = false
    }
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
        Введіть свою електронну адресу та пароль
      </p>
    </div>

    <!-- Email -->
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

    <!-- Password -->
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
          class="pr-10 py-5  "
          required
        />
        <button
          type="button"
          onclick={() => (showPassword = !showPassword)}
          class="absolute mr-0.5 top-1/2 right-0.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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

    <!-- Server error -->
    {#if serverError}
      <Field>
        <FieldError role="alert">{serverError}</FieldError>
      </Field>
    {/if}

    <!-- Submit -->
    <Field>
   <Button
        class="relative py-6  "
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

    <FieldSeparator />

    <FieldDescription class="text-center">
      Немає облікового запису?
      <a
        href="/user/register"
        class="ms-auto text-sm underline-offset-4 hover:underline"
      >
        Зареєструватися
      </a>
    </FieldDescription>
  </FieldGroup>
</form>
