<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Card from '$lib/components/ui/card/index.js'
  import {
    FieldGroup,
    Field,
    FieldLabel,
    FieldDescription,
    FieldSeparator,
  } from '$lib/components/ui/field/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { cn } from '$lib/utils.js'
  import type { HTMLAttributes } from 'svelte/elements'
  import { signIn } from '$lib/auth-client'
  import { goto, invalidateAll } from '$app/navigation'
  import {
    LoaderCircle,
    AlertCircle,
    CheckCircle2,
    Eye,
    EyeOff,
  } from 'lucide-svelte'
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

  let touched = $state({
    email: false,
    password: false,
  })

  // ─── Валідація ───
  const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

  function isValidEmail(e: string): boolean {
    const trimmed = e.trim()
    return (
      trimmed.length >= 3 && trimmed.length <= 254 && EMAIL_RE.test(trimmed)
    )
  }

  // ─── Derived ───
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
        if (err.status === 403) {
          serverError = 'Підтвердіть email перед входом'
        } else if (err.status === 429) {
          serverError = 'Забагато спроб. Спробуйте через хвилину.'
        } else {
          serverError = 'Невірний email або пароль'
        }
        return
      }
      await invalidateAll()
      goto('/dashboard')
    } catch (err) {
      console.error('[login] failed:', err)
      serverError = "Помилка з'єднання. Перевірте інтернет."
    } finally {
      loading = false
    }
  }

  async function handleGoogle() {
    if (loading) return
    loading = true
    try {
      await signIn.social({ provider: 'google', callbackURL: '/' })
    } catch (err) {
      console.error('[login] google failed:', err)
      serverError = 'Не вдалось увійти через Google'
      loading = false
    }
  }

  async function handleApple() {
    if (loading) return
    loading = true
    try {
      await signIn.social({ provider: 'apple', callbackURL: '/' })
    } catch (err) {
      console.error('[login] apple failed:', err)
      serverError = 'Не вдалось увійти через Apple'
      loading = false
    }
  }
</script>

<div class={cn('flex flex-col gap-6', className)} {...restProps}>
  <Card.Root class="overflow-hidden">
    <Card.Header class="text-center space-y-2">
      <Card.Title class="text-2xl font-bold tracking-tight">
        Ласкаво просимо
      </Card.Title>
      <Card.Description class="text-sm">
        Увійдіть у свій акаунт
      </Card.Description>
    </Card.Header>

    <Card.Content>
      <form onsubmit={handleSubmit} novalidate autocomplete="on">
        <FieldGroup>
          <!-- ─── Social ─── -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              variant="outline"
              type="button"
              onclick={handleApple}
              disabled={loading}
              class="h-11 rounded-lg cursor-pointer disabled:cursor-not-allowed"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                class="size-4 mr-2"
              >
                <path
                  d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
                  fill="currentColor"
                />
              </svg>
              <span class="text-sm">Apple</span>
            </Button>
            <Button
              variant="outline"
              type="button"
              onclick={handleGoogle}
              disabled={loading}
              class="h-11 rounded-lg cursor-pointer disabled:cursor-not-allowed"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                class="size-4 mr-2"
              >
                <path
                  d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                  fill="currentColor"
                />
              </svg>
              <span class="text-sm">Google</span>
            </Button>
          </div>

          <FieldSeparator class="*:data-[slot=field-separator-content]:bg-card">
            Або email
          </FieldSeparator>

          <!-- ─── Email ─── -->
          <Field>
            <FieldLabel for="email-{id}">Email</FieldLabel>
            <div class="relative">
              <Input
                id="email-{id}"
                type="email"
                placeholder="ivan@example.com"
                bind:value={email}
                onblur={() => (touched.email = true)}
                autocomplete="email"
                maxlength={254}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? `email-err-${id}` : undefined}
                class="h-11 rounded-lg pr-9"
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
              <FieldDescription id="email-err-{id}" class="text-destructive">
                {emailError}
              </FieldDescription>
            {/if}
          </Field>

          <!-- ─── Password ─── -->
          <Field>
            <div class="flex items-center">
              <FieldLabel for="password-{id}">Пароль</FieldLabel>
              <a
                href="/user/forgot"
                class="ms-auto text-xs underline-offset-4 hover:underline"
                style="color: var(--muted-foreground)"
              >
                Забули пароль?
              </a>
            </div>
            <div class="relative">
              <Input
                id="password-{id}"
                type={showPassword ? 'text' : 'password'}
                bind:value={password}
                onblur={() => (touched.password = true)}
                autocomplete="current-password"
                aria-invalid={!!passwordError}
                aria-describedby={passwordError ? `pw-err-${id}` : undefined}
                class="h-11 rounded-lg pr-9"
                required
              />
              <button
                type="button"
                onclick={() => (showPassword = !showPassword)}
                class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded cursor-pointer hover:opacity-70"
                aria-label={showPassword ? 'Сховати пароль' : 'Показати пароль'}
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
              <FieldDescription id="pw-err-{id}" class="text-destructive">
                {passwordError}
              </FieldDescription>
            {/if}
          </Field>

          <!-- ─── Server error ─── -->
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

          <!-- ─── Submit ─── -->
          <Field>
            <Button
              type="submit"
              disabled={loading || !formValid}
              class="w-full h-11 rounded-lg cursor-pointer disabled:cursor-not-allowed"
            >
              {#if loading}
                <Spinner />
              {:else}
                Увійти
              {/if}
            </Button>
            <FieldDescription class="text-center text-xs">
              Немає облікового запису?
              <a
                href="/user/register"
                class="font-medium hover:underline"
                style="color: var(--primary)"
              >
                Зареєструватися
              </a>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </Card.Content>
  </Card.Root>

  <FieldDescription class="px-6 text-center text-xs">
    Натискаючи «Увійти», ви погоджуєтеся з нашими
    <a href="/terms" target="_blank" rel="noopener" class="hover:underline"
      >Умовами</a
    >
    та
    <a href="/privacy" target="_blank" rel="noopener" class="hover:underline"
      >Політикою</a
    >.
  </FieldDescription>
</div>
