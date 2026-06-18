<script lang="ts">
  import { cn } from '$lib/utils.js'
  import type { HTMLAttributes } from 'svelte/elements'
  import { signIn } from '$lib/auth-client'
  import { goto, invalidateAll } from '$app/navigation'
  import { dev } from '$app/environment'
  import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-svelte'
  import { Button } from './ui/button'
  import { Spinner } from './ui/spinner'

  let { class: className, ...restProps }: HTMLAttributes<HTMLDivElement> =
    $props()
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
      const { error: err } = await signIn.email({
        email: email.trim().toLowerCase(),
        password,
      })
      if (err) {
        // Generic-повідомлення: не розкриваємо, що саме невірно (захист від перебору).
        if (err.status === 403) serverError = 'Підтвердіть email перед входом'
        else if (err.status === 429)
          serverError = 'Забагато спроб. Спробуйте через хвилину.'
        else serverError = 'Невірний email або пароль'
        return
      }
      await invalidateAll()
      goto('/dashboard')
    } catch (err) {
      // Лог лише в dev — у проді не світимо деталей у консоль користувача.
      if (dev) console.error('[login] failed:', err)
      serverError = "Помилка з'єднання. Перевірте інтернет."
    } finally {
      loading = false
    }
  }
</script>

<div
  class={cn('login-scope flex w-full max-w-104 flex-col gap-4.5', className)}
  {...restProps}
>
  <!-- glass card -->
  <div
    class="rounded-[32px] border border-border bg-card px-9 pt-10 pb-8.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.1),0_8px_20px_-8px_rgba(0,0,0,0.05)]"
  >
    <div class="mb-6 text-center">
      <h1 class="text-[24px] font-bold tracking-[-0.035em] text-foreground">
        Увійдіть у свій акаунт
      </h1>
      <p class="mt-1.5 text-[14.5px] text-muted-foreground">
        Раді бачити вас знову
      </p>
    </div>

    <form
      onsubmit={handleSubmit}
      novalidate
      autocomplete="on"
      class="flex flex-col gap-4.5"
    >
      <!-- Email -->
      <div class="flex flex-col gap-2">
        <label
          for="email-{id}"
          class="text-sm font-semibold tracking-[-0.01em] text-foreground"
        >
          Email
        </label>
        <div class="relative">
          <input
            id="email-{id}"
            type="email"
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
        {#if emailError}
          <p id="email-err-{id}" class="text-[12.5px] text-destructive">
            {emailError}
          </p>
        {/if}
      </div>

      <!-- Password -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <label
            for="password-{id}"
            class="text-sm font-semibold tracking-[-0.01em] text-foreground"
          >
            Пароль
          </label>
          <a
            href="/user/forgot"
            class="rounded-sm text-[12.5px] text-muted-foreground underline-offset-[3px] hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Забули пароль?
          </a>
        </div>
        <div class="relative">
          <input
            id="password-{id}"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••••"
            bind:value={password}
            onblur={() => (touched.password = true)}
            autocomplete="current-password"
            aria-invalid={!!passwordError}
            aria-describedby={passwordError ? `pw-err-${id}` : undefined}
            class="field-input pr-11"
            required
          />
          <button
            type="button"
            onclick={() => (showPassword = !showPassword)}
            class="absolute cursor-pointer top-1/2 right-2 flex size-8.5 -translate-y-1/2 items-center justify-center rounded-[9px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={showPassword ? 'Сховати пароль' : 'Показати пароль'}
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
          <p id="pw-err-{id}" class="text-[12.5px] text-destructive">
            {passwordError}
          </p>
        {/if}
      </div>

      <!-- Server error -->
      {#if serverError}
        <div
          class="flex items-start gap-2.5 rounded-[13px] border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-[13.5px] leading-snug text-destructive"
          role="alert"
        >
          <AlertCircle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      {/if}

      <!-- Submit -->
      <Button
        type="submit"
        disabled={loading || !formValid}
        aria-busy={loading}
        class="mt-1.5 inline-flex h-13.5 w-full items-center justify-center gap-2.5 rounded-[16px] bg-foreground text-[15.5px] font-semibold tracking-[-0.01em] text-background transition hover:-translate-y-px active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        {#if loading}
          <Spinner aria-hidden="true" />
          <span class="sr-only">Виконуємо вхід…</span>
        {:else}
          Увійти
        {/if}
      </Button>

      <p class="text-center text-[13.5px] text-muted-foreground">
        Немає облікового запису?
        <a
          href="/user/register"
          class="rounded-sm font-semibold text-foreground underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Зареєструватися
        </a>
      </p>
    </form>
  </div>

  <p class="px-3 text-center text-xs leading-relaxed text-muted-foreground">
    Натискаючи «Увійти», ви погоджуєтеся з нашими
    <a
      href="/terms"
      target="_blank"
      rel="noopener"
      class="underline-offset-2 hover:underline">Умовами</a
    >
    та
    <a
      href="/privacy"
      target="_blank"
      rel="noopener"
      class="underline-offset-2 hover:underline">Політикою</a
    >.
  </p>
</div>

<style>
  /* Тонований фон сторінки — на токенах, адаптується до теми. */
  :global(body:has(.login-scope)) {
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

  .field-input {
    width: 100%;
    height: 54px;
    padding-left: 18px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--muted);
    color: var(--foreground);
    font-size: 15px;
    font-weight: 500;
    outline: none;
    transition:
      border-color 0.16s ease,
      background 0.16s ease,
      box-shadow 0.16s ease;
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
  /* Стан помилки керується через aria-invalid — без зайвого класу. */
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
</style>
