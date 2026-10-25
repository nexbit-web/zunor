<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Spinner } from '$lib/components/ui/spinner'
  import AuthShell from '$lib/components/auth/auth-shell.svelte'
  import FieldError from '$lib/components/forms/field-error.svelte'
  import { onDestroy } from 'svelte'

  // ═══════════════════════════════════════════════════════════
  // Константи
  // ═══════════════════════════════════════════════════════════

  const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  const EMAIL_MAX_LENGTH = 254
  const REQUEST_TIMEOUT_MS = 15_000 // 15 сек на запит
  const RESEND_COOLDOWN_SEC = 60 // не дозволяємо retry раніше ніж через 1 хв

  // ═══════════════════════════════════════════════════════════
  // State
  // ═══════════════════════════════════════════════════════════

  let email = $state('')
  let loading = $state(false)
  let serverError = $state('')
  let sent = $state(false)
  let touched = $state(false)
  let cooldown = $state(0)
  let cooldownInterval: ReturnType<typeof setInterval> | null = null
  let abortController: AbortController | null = null

  // ═══════════════════════════════════════════════════════════
  // Validation
  // ═══════════════════════════════════════════════════════════

  function isValidEmail(e: string): boolean {
    const trimmed = e.trim()
    return (
      trimmed.length >= 3 &&
      trimmed.length <= EMAIL_MAX_LENGTH &&
      EMAIL_RE.test(trimmed)
    )
  }

  const emailError = $derived(
    touched && !isValidEmail(email) ? 'Невірний формат email' : '',
  )

  const formValid = $derived(isValidEmail(email))

  // ═══════════════════════════════════════════════════════════
  // Cooldown timer для повторного запиту
  // ═══════════════════════════════════════════════════════════

  function startCooldown() {
    cooldown = RESEND_COOLDOWN_SEC
    if (cooldownInterval) clearInterval(cooldownInterval)
    cooldownInterval = setInterval(() => {
      cooldown--
      if (cooldown <= 0 && cooldownInterval) {
        clearInterval(cooldownInterval)
        cooldownInterval = null
      }
    }, 1000)
  }

  function tryAgain() {
    if (cooldown > 0) return
    sent = false
    serverError = ''
    touched = false
  }

  // ═══════════════════════════════════════════════════════════
  // Submit
  // ═══════════════════════════════════════════════════════════

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading) return

    // Перевірка на натиск, а не на blur: кнопка лишається активною, і
    // причину видно під полем, а не в сірій незатискуваній кнопці.
    touched = true
    if (!formValid) return

    loading = true
    serverError = ''

    // Скасовуємо попередній запит, якщо ще не завершився
    if (abortController) abortController.abort()
    abortController = new AbortController()

    // Таймаут на весь запит
    const timeoutId = setTimeout(() => {
      abortController?.abort()
    }, REQUEST_TIMEOUT_MS)

    try {
      const res = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          redirectTo: '/user/reset-password',
        }),
        signal: abortController.signal,
      })

      clearTimeout(timeoutId)

      // Rate limit — показуємо реальну помилку
      if (res.status === 429) {
        serverError = 'Забагато спроб. Спробуйте пізніше.'
        return
      }

      // Інші помилки — silent (захист від email enumeration).
      // Юзер завжди бачить "лист відправлено", навіть якщо email не існує.
      if (!res.ok) {
        // Логуємо для нашої діагностики, але не показуємо юзеру
        console.warn('[forgot] non-OK response:', res.status)
      }

      sent = true
      startCooldown()
    } catch (err) {
      clearTimeout(timeoutId)

      // AbortError — скасовано таймаутом або повторним submit
      if ((err as Error).name === 'AbortError') {
        serverError = 'Запит зайняв забагато часу. Спробуйте ще раз.'
        return
      }

      console.error('[forgot] network failed:', err)
      serverError = "Помилка з'єднання. Перевірте інтернет."
    } finally {
      loading = false
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Cleanup
  // ═══════════════════════════════════════════════════════════

  onDestroy(() => {
    if (cooldownInterval) clearInterval(cooldownInterval)
    if (abortController) abortController.abort()
  })
</script>

<svelte:head>
  <title>Відновлення паролю — Zunor</title>
  <meta name="description" content="Відновіть доступ до свого акаунту Zunor" />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!-- Та сама рамка, що на вході й реєстрації, і той самий склад, що в
     ClickUp: знак, «Забули пароль?», посилання на вхід, одне поле й
     кнопка. Окремого «Повернутись до входу» під формою немає — це вже
     посилання «Увійти» під заголовком. -->
<AuthShell title={sent ? 'Перевірте пошту' : 'Забули пароль?'}>
  {#snippet subtitle()}
    {#if sent}
      Якщо обліковий запис з адресою
      <span class="text-foreground">{email.trim()}</span>
      існує, ми надіслали посилання для відновлення. Лист міг потрапити в
      «Спам».
    {:else}
      Пам'ятаєте пароль?
      <a
        href="/user/login"
        class="text-primary underline-offset-4 transition-colors hover:text-primary-hover hover:underline"
      >
        Увійти
      </a>
    {/if}
  {/snippet}

  {#if !sent}
    <form
      onsubmit={handleSubmit}
      novalidate
      autocomplete="on"
      class="flex flex-col gap-3"
    >
      <div>
        <Input
          id="forgot-email"
          type="email"
          placeholder="Робоча електронна пошта"
          aria-label="Робоча електронна пошта"
          bind:value={email}
          autocomplete="email"
          inputmode="email"
          autocapitalize="none"
          spellcheck="false"
          maxlength={EMAIL_MAX_LENGTH}
          aria-invalid={!!emailError}
          aria-describedby={emailError ? 'forgot-email-error' : undefined}
          class="h-9 rounded-[8px]"
          required
        />
        <FieldError id="forgot-email-error" text={emailError} />
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
        disabled={loading}
        aria-busy={loading}
      >
        {#if loading}
          <Spinner class="animate-spin" aria-hidden="true" />
          <span class="sr-only">Надсилаємо...</span>
        {:else}
          <span>Надіслати мені посилання</span>
        {/if}
      </Button>
    </form>
  {:else}
    <!-- ─── Лист відправлено ───
         Повтор — та сама кнопка, що й надіслала лист; доки йде відлік,
         вона сіра й показує, скільки чекати. -->
    <div class="flex flex-col gap-3">
      <Button
        variant="primary"
        size="lg"
        class="w-full"
        type="button"
        onclick={tryAgain}
        disabled={cooldown > 0}
      >
        {cooldown > 0
          ? `Надіслати ще раз через ${cooldown} с`
          : 'Надіслати ще раз'}
      </Button>

      <a
        href="/user/login"
        class="mx-auto rounded-sm text-[14px] text-primary underline-offset-4 transition-colors hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Повернутися до входу
      </a>
    </div>
  {/if}
</AuthShell>
