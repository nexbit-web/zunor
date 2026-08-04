<script lang="ts">
  import * as Field from '$lib/components/ui/field/index.js'
  import * as InputOTP from '$lib/components/ui/input-otp/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Spinner } from '$lib/components/ui/spinner/index.js'
  import { emailOtp } from '$lib/auth-client'
  import { goto, invalidateAll } from '$app/navigation'
  import { cn } from '$lib/utils.js'
  import toast from 'svelte-hot-french-toast'

  interface Props {
    /** Адреса, на яку відправлено код. Приходить із load, не з інпута. */
    email: string
    class?: string
  }

  let { email, class: className }: Props = $props()

  const CODE_LENGTH = 6
  const RESEND_COOLDOWN_SEC = 60

  let code = $state('')
  let verifying = $state(false)
  let resending = $state(false)
  let serverError = $state('')
  let cooldown = $state(RESEND_COOLDOWN_SEC)

  const complete = $derived(code.length === CODE_LENGTH)

  // Таймер «надіслати ще раз». Чистимо при розмонтуванні, інакше
  // інтервал переживе перехід і смикатиме state мертвого компонента.
  $effect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      cooldown = Math.max(0, cooldown - 1)
    }, 1000)
    return () => clearInterval(timer)
  })

  async function handleVerify(e: SubmitEvent) {
    e.preventDefault()
    if (verifying || !complete) return

    verifying = true
    serverError = ''
    try {
      const { error: err } = await emailOtp.verifyEmail({ email, otp: code })

      if (err) {
        // TOO_MANY_ATTEMPTS: код згорів після 5 промахів, потрібен новий.
        if (err.code === 'TOO_MANY_ATTEMPTS') {
          serverError = 'Забагато спроб. Запросіть новий код.'
          code = ''
          cooldown = 0
        } else if (err.status === 429) {
          serverError = 'Забагато запитів. Спробуйте за хвилину.'
        } else {
          serverError = 'Невірний або застарілий код'
          code = ''
        }
        return
      }

      // autoSignInAfterVerification: сесія вже створена сервером.
      // invalidateAll — щоб layout підхопив її до навігації.
      await invalidateAll()
      toast.success('Пошту підтверджено!', { duration: 2000 })
      await goto('/dashboard')
    } catch {
      serverError = "Помилка з'єднання. Перевірте інтернет."
    } finally {
      verifying = false
    }
  }

  async function handleResend() {
    if (resending || cooldown > 0) return

    resending = true
    serverError = ''
    try {
      const { error: err } = await emailOtp.sendVerificationOtp({
        email,
        type: 'email-verification',
      })
      if (err) {
        serverError =
          err.status === 429
            ? 'Забагато запитів. Зачекайте трохи.'
            : 'Не вдалося надіслати код'
        return
      }
      code = ''
      cooldown = RESEND_COOLDOWN_SEC
      toast('Новий код надіслано', { icon: '📨' })
    } catch {
      serverError = "Помилка з'єднання. Перевірте інтернет."
    } finally {
      resending = false
    }
  }
</script>

<div class={cn('flex flex-col gap-6', className)}>
  <form onsubmit={handleVerify} novalidate>
    <Field.Group>
      <div class="flex flex-col items-center gap-1 text-center">
        <h1 class="text-2xl font-bold">Підтвердіть пошту</h1>
        <p class="text-sm text-balance text-muted-foreground">
          Ми надіслали 6-значний код на <span
            class="font-medium text-foreground">{email}</span
          >
        </p>
      </div>

      <Field.Field>
        <Field.Label for="otp" class="sr-only">Код підтвердження</Field.Label>
        <InputOTP.Root
          maxlength={CODE_LENGTH}
          id="otp"
          bind:value={code}
          disabled={verifying}
          aria-invalid={!!serverError}
          aria-describedby={serverError ? 'otp-err' : undefined}
          required
        >
          {#snippet children({ cells })}
            <InputOTP.Group
              class="gap-2 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border"
            >
              {#each cells.slice(0, 3) as cell (cell)}
                <InputOTP.Slot {cell} />
              {/each}
            </InputOTP.Group>
            <InputOTP.Separator />
            <InputOTP.Group
              class="gap-2 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border"
            >
              {#each cells.slice(3, 6) as cell (cell)}
                <InputOTP.Slot {cell} />
              {/each}
            </InputOTP.Group>
          {/snippet}
        </InputOTP.Root>

        {#if serverError}
          <Field.Error id="otp-err" role="alert">{serverError}</Field.Error>
        {:else}
          <Field.Description class="text-center">
            Код дійсний 10 хвилин.
          </Field.Description>
        {/if}
      </Field.Field>

      <Button
        class="relative py-6"
        type="submit"
        disabled={verifying || !complete}
        aria-busy={verifying}
      >
        <span>{verifying ? 'Перевіряємо...' : 'Підтвердити'}</span>
        {#if verifying}
          <Spinner class="absolute right-4 animate-spin" aria-hidden="true" />
        {/if}
      </Button>

      <Field.Description class="text-center">
        {#if cooldown > 0}
          Надіслати ще раз можна через {cooldown} с
        {:else}
          Не отримали код?
          <button
            type="button"
            onclick={handleResend}
            disabled={resending}
            class="underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            {resending ? 'Надсилаємо...' : 'Надіслати ще раз'}
          </button>
        {/if}
      </Field.Description>
    </Field.Group>
  </form>
</div>
