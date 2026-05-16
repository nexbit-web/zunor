<!-- src/routes/(auth)/user/reset-password/+page.svelte -->
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
  import { authClient } from '$lib/auth-client'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import {
    LoaderCircle,
    AlertCircle,
    CheckCircle2,
    Lock,
    Eye,
    EyeOff,
    ArrowLeft,
  } from 'lucide-svelte'

  // ─── Token з URL ───
  const token = $derived(page.url.searchParams.get('token') ?? '')
  const tokenValid = $derived(token.length > 0 && token.length < 500)

  // ─── State ───
  let password = $state('')
  let confirm = $state('')
  let showPassword = $state(false)
  let loading = $state(false)
  let serverError = $state('')
  let success = $state(false)
  let touched = $state({ password: false, confirm: false })

  // ─── Password strength (як у register) ───
  function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
    if (pw.length < 8) return { score: 0, label: 'Закороткий' }
    let score = 0
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
    if (/\d/.test(pw)) score++
    if (/[^a-zA-Z0-9]/.test(pw) || pw.length >= 12) score++
    if (score <= 1) return { score: 1, label: 'Слабкий' }
    if (score === 2) return { score: 2, label: 'Середній' }
    return { score: 3, label: 'Надійний' }
  }

  const pwStrength = $derived(passwordStrength(password))

  // ─── Derived validation ───
  const passwordError = $derived(
    touched.password && password.length < 8 ? 'Мінімум 8 символів' : '',
  )
  const confirmError = $derived(
    touched.confirm && password !== confirm ? 'Паролі не збігаються' : '',
  )
  const formValid = $derived(
    password.length >= 8 && password === confirm && tokenValid,
  )

  // ─── Submit ───
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading) return

    touched = { password: true, confirm: true }

    if (!tokenValid) {
      serverError = 'Невірне посилання. Запросіть нове у формі відновлення.'
      return
    }

    if (!formValid) {
      serverError = 'Перевірте правильність полів'
      return
    }

    loading = true
    serverError = ''

    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token,
      })

      if (error) {
        if (error.status === 400 || error.status === 401) {
          serverError = 'Посилання недійсне або застаріло. Запросіть нове.'
        } else {
          serverError = 'Не вдалось змінити пароль. Спробуйте ще раз.'
        }
        return
      }

      success = true
      // Через 2.5 секунди редіректимо на логін
      setTimeout(() => goto('/user/login'), 2500)
    } catch (err) {
      console.error('[reset-password] failed:', err)
      serverError = 'Помилка з\'єднання. Перевірте інтернет.'
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>Новий пароль — Zunor</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen flex items-center justify-center px-4 py-12" style="background-color: var(--background)">
  <div class="w-full max-w-md flex flex-col gap-6">
    <Card.Root class="overflow-hidden">
      {#if !tokenValid}
        <!-- ─── Invalid token ─── -->
        <Card.Header class="text-center space-y-3">
          <div
            class="size-14 rounded-2xl mx-auto flex items-center justify-center"
            style="background-color: color-mix(in oklch, var(--destructive) 12%, transparent)"
          >
            <AlertCircle class="size-6" style="color: var(--destructive)" />
          </div>
          <Card.Title class="text-2xl font-bold tracking-tight">
            Посилання недійсне
          </Card.Title>
          <Card.Description class="text-sm">
            Це посилання не містить валідного токена. Запросіть нове у формі відновлення паролю.
          </Card.Description>
        </Card.Header>

        <Card.Content>
          <Button
            href="/user/forgot"
            class="w-full h-11 rounded-lg cursor-pointer"
          >
            Запросити нове посилання
          </Button>
        </Card.Content>
      {:else if success}
        <!-- ─── Success ─── -->
        <Card.Header class="text-center space-y-3">
          <div
            class="size-14 rounded-2xl mx-auto flex items-center justify-center"
            style="background-color: color-mix(in oklch, var(--primary) 12%, transparent)"
          >
            <CheckCircle2 class="size-6" style="color: var(--primary)" />
          </div>
          <Card.Title class="text-2xl font-bold tracking-tight">
            Пароль змінено
          </Card.Title>
          <Card.Description class="text-sm">
            Перенаправляємо на сторінку входу…
          </Card.Description>
        </Card.Header>

        <Card.Content>
          <div class="flex justify-center py-2">
            <LoaderCircle class="size-5 animate-spin" style="color: var(--primary)" />
          </div>
        </Card.Content>
      {:else}
        <!-- ─── Form ─── -->
        <Card.Header class="text-center space-y-2">
          <div
            class="size-12 rounded-2xl mx-auto flex items-center justify-center"
            style="background-color: color-mix(in oklch, var(--primary) 10%, transparent)"
          >
            <Lock class="size-5" style="color: var(--primary)" />
          </div>
          <Card.Title class="text-2xl font-bold tracking-tight">
            Новий пароль
          </Card.Title>
          <Card.Description class="text-sm">
            Введіть новий пароль для свого акаунту
          </Card.Description>
        </Card.Header>

        <Card.Content>
          <form onsubmit={handleSubmit} novalidate autocomplete="off">
            <FieldGroup>
              <!-- New password -->
              <Field>
                <FieldLabel for="new-password">Новий пароль</FieldLabel>
                <div class="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    bind:value={password}
                    onblur={() => (touched.password = true)}
                    autocomplete="new-password"
                    minlength={8}
                    maxlength={128}
                    aria-invalid={!!passwordError}
                    aria-describedby={passwordError ? 'new-pw-err' : undefined}
                    class="h-11 rounded-lg pr-9"
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
                  <FieldDescription id="new-pw-err" class="text-destructive">
                    {passwordError}
                  </FieldDescription>
                {/if}
              </Field>

              <!-- Strength bar -->
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

              <!-- Confirm -->
              <Field>
                <FieldLabel for="confirm-password">Повторіть пароль</FieldLabel>
                <Input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  bind:value={confirm}
                  onblur={() => (touched.confirm = true)}
                  autocomplete="new-password"
                  minlength={8}
                  maxlength={128}
                  aria-invalid={!!confirmError}
                  class="h-11 rounded-lg"
                  required
                />
                {#if confirmError}
                  <FieldDescription class="text-destructive">
                    {confirmError}
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
                  <AlertCircle class="size-4 shrink-0 mt-0.5" />
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
                    <LoaderCircle class="size-4 animate-spin mr-2" />
                    Зберігаємо…
                  {:else}
                    Зберегти пароль
                  {/if}
                </Button>
              </Field>

              <a
                href="/user/login"
                class="text-xs text-center cursor-pointer hover:opacity-70 inline-flex items-center justify-center gap-1 w-full"
                style="color: var(--muted-foreground)"
              >
                <ArrowLeft class="size-3" />
                Повернутись до входу
              </a>
            </FieldGroup>
          </form>
        </Card.Content>
      {/if}
    </Card.Root>
  </div>
</div>