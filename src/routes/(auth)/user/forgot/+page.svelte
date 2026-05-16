<!-- src/routes/(auth)/user/forgot/+page.svelte -->
<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'
  import {
    FieldGroup,
    Field,
    FieldLabel,
    FieldDescription,
  } from '$lib/components/ui/field'
  import { Input } from '$lib/components/ui/input'
  import {
    LoaderCircle,
    AlertCircle,
    CheckCircle2,
    Mail,
    ArrowLeft,
  } from 'lucide-svelte'
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

    touched = true

    if (!formValid) {
      serverError = 'Введіть коректний email'
      return
    }

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

<div
  class="min-h-screen flex items-center justify-center px-4 py-12"
  style="background-color: var(--background)"
>
  <div class="w-full max-w-md flex flex-col gap-6">
    <Card.Root class="overflow-hidden">
      {#if !sent}
        <!-- ─── Form ─── -->
        <Card.Header class="text-center space-y-2">
          <div
            class="size-12 rounded-2xl mx-auto flex items-center justify-center"
            style="background-color: color-mix(in oklch, var(--primary) 10%, transparent)"
          >
            <Mail class="size-5" style="color: var(--primary)" />
          </div>
          <Card.Title class="text-2xl font-bold tracking-tight">
            Забули пароль?
          </Card.Title>
          <Card.Description class="text-sm">
            Введіть email і ми надішлемо посилання для відновлення
          </Card.Description>
        </Card.Header>

        <Card.Content>
          <form onsubmit={handleSubmit} novalidate autocomplete="on">
            <FieldGroup>
              <Field>
                <FieldLabel for="forgot-email">Email</FieldLabel>
                <div class="relative">
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="ivan@example.com"
                    bind:value={email}
                    onblur={() => (touched = true)}
                    autocomplete="email"
                    inputmode="email"
                    maxlength={EMAIL_MAX_LENGTH}
                    aria-invalid={!!emailError}
                    aria-describedby={emailError
                      ? 'forgot-email-error'
                      : undefined}
                    class="h-11 rounded-lg pr-9"
                    required
                  />
                  {#if touched && isValidEmail(email)}
                    <CheckCircle2
                      class="absolute right-3 top-1/2 -translate-y-1/2 size-4"
                      style="color: var(--primary)"
                      aria-hidden="true"
                    />
                  {:else if emailError}
                    <AlertCircle
                      class="absolute right-3 top-1/2 -translate-y-1/2 size-4"
                      style="color: var(--destructive)"
                      aria-hidden="true"
                    />
                  {/if}
                </div>
                {#if emailError}
                  <FieldDescription
                    id="forgot-email-error"
                    class="text-destructive"
                  >
                    {emailError}
                  </FieldDescription>
                {/if}
              </Field>

              {#if serverError}
                <div
                  class="flex items-start gap-2 p-3 rounded-lg text-sm"
                  style="background-color: color-mix(in oklch, var(--destructive) 8%, transparent);
                         color: var(--destructive);
                         border: 1px solid color-mix(in oklch, var(--destructive) 25%, transparent)"
                  role="alert"
                >
                  <AlertCircle
                    class="size-4 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>{serverError}</span>
                </div>
              {/if}

              <Field>
                <Button
                  type="submit"
                  disabled={loading || !formValid}
                  class="w-full h-11 rounded-lg cursor-pointer disabled:cursor-not-allowed"
                >
                  {#if loading}
                    <LoaderCircle
                      class="size-4 animate-spin mr-2"
                      aria-hidden="true"
                    />
                    Надсилаємо…
                  {:else}
                    Надіслати посилання
                  {/if}
                </Button>
              </Field>

              <a
                href="/user/login"
                class="text-xs text-center cursor-pointer hover:opacity-70 inline-flex items-center justify-center gap-1 w-full"
                style="color: var(--muted-foreground)"
              >
                <ArrowLeft class="size-3" aria-hidden="true" />
                Повернутись до входу
              </a>
            </FieldGroup>
          </form>
        </Card.Content>
      {:else}
        <!-- ─── Success ─── -->
        <Card.Header class="text-center space-y-3">
          <div
            class="size-14 rounded-2xl mx-auto flex items-center justify-center"
            style="background-color: color-mix(in oklch, var(--primary) 12%, transparent)"
          >
            <CheckCircle2
              class="size-6"
              style="color: var(--primary)"
              aria-hidden="true"
            />
          </div>
          <Card.Title class="text-2xl font-bold tracking-tight">
            Перевірте пошту
          </Card.Title>
          <Card.Description class="text-sm leading-relaxed">
            Якщо акаунт з адресою
            <span class="font-medium" style="color: var(--foreground)"
              >{email}</span
            >
            існує, ми надіслали інструкції для відновлення паролю.
          </Card.Description>
        </Card.Header>

        <Card.Content>
          <FieldGroup>
            <p
              class="text-xs text-center leading-relaxed px-2"
              style="color: var(--muted-foreground)"
            >
              Не отримали лист? Перевірте папку «Спам»
              {#if cooldown > 0}
                <br />
                <span class="opacity-70">
                  Можна спробувати ще раз через {cooldown}с
                </span>
              {:else}
                або
                <button
                  type="button"
                  onclick={tryAgain}
                  class="cursor-pointer hover:underline font-medium"
                  style="color: var(--primary)"
                >
                  спробуйте ще раз
                </button>
              {/if}
            </p>

            <a
              href="/user/login"
              class="text-xs text-center cursor-pointer hover:opacity-70 inline-flex items-center justify-center gap-1 w-full mt-2"
              style="color: var(--muted-foreground)"
            >
              <ArrowLeft class="size-3" aria-hidden="true" />
              Повернутись до входу
            </a>
          </FieldGroup>
        </Card.Content>
      {/if}
    </Card.Root>
  </div>
</div>
