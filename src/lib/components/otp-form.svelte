<script lang="ts">
  import * as InputOTP from '$lib/components/ui/input-otp/index.js'
  import { Spinner } from '$lib/components/ui/spinner/index.js'
  import { CircleAlert } from 'lucide-svelte'
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

  // Таймер «надіслати ще раз». Чистимо при розмонтуванні, інакше
  // інтервал переживе перехід і смикатиме state мертвого компонента.
  $effect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      cooldown = Math.max(0, cooldown - 1)
    }, 1000)
    return () => clearInterval(timer)
  })

  // Кнопки «Підтвердити» немає навмисно: код має рівно шість цифр, тож
  // момент «готово» система знає сама. Кнопка тут була б проханням
  // підтвердити те, що людина вже й так дописала до кінця.
  async function verify() {
    if (verifying || code.length !== CODE_LENGTH) return

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

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    void verify()
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

<div class={cn('flex flex-col gap-7', className)}>
  <div class="flex flex-col gap-3 text-center">
    <h1 class="text-2xl font-semibold">Підтвердіть пошту</h1>
    <p class="text-[15px] leading-relaxed text-balance text-muted-foreground">
      Ми надіслали код підтвердження на
      <span class="text-foreground">{email}</span>. Щоб продовжити, введіть
      його.
    </p>
  </div>

  <form onsubmit={handleSubmit} novalidate>
    <label for="otp" class="sr-only">Код підтвердження</label>
    <InputOTP.Root
      maxlength={CODE_LENGTH}
      id="otp"
      bind:value={code}
      disabled={verifying}
      onComplete={() => void verify()}
      aria-invalid={!!serverError}
      aria-describedby={serverError ? 'otp-err' : undefined}
      class="justify-center"
      required
    >
      {#snippet children({ cells })}
        <!-- Одна група без роздільника: рисочка посередині ділила код на
             «3 + 3», хоча сервер шле шість цифр підряд. -->
        <InputOTP.Group class="gap-2 sm:gap-2.5">
          {#each cells as cell (cell)}
            <InputOTP.Slot
              {cell}
              class="size-11 rounded-[10px]! border! text-xl shadow-none sm:size-14"
            />
          {/each}
        </InputOTP.Group>
      {/snippet}
    </InputOTP.Root>
  </form>

  <!-- Місце під статус зарезервоване завжди: інакше поява помилки
       підкидає посилання під нею на рядок вниз, і палець промахується. -->
  <div class="-mt-3 min-h-5 text-center">
    {#if verifying}
      <p
        class="flex items-center justify-center gap-2 text-[13px] text-muted-foreground"
      >
        <Spinner class="size-3.5 animate-spin" aria-hidden="true" />
        Перевіряємо...
      </p>
    {:else if serverError}
      <p
        id="otp-err"
        role="alert"
        class="flex items-center justify-center gap-1.5 text-[13px] text-destructive"
      >
        <CircleAlert class="size-3.5 shrink-0" aria-hidden="true" />
        {serverError}
      </p>
    {/if}
  </div>

  <div class="flex flex-col items-center gap-2 text-[15px]">
    {#if cooldown > 0}
      <span class="text-muted-foreground">
        Надіслати код ще раз можна через {cooldown} с
      </span>
    {:else}
      <button
        type="button"
        onclick={handleResend}
        disabled={resending}
        class="rounded-sm text-primary underline-offset-4 transition-colors hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
      >
        {resending ? 'Надсилаємо...' : 'Надіслати код ще раз'}
      </button>
    {/if}

    <a
      href="/user/login"
      class="text-primary underline-offset-4 transition-colors hover:text-primary-hover hover:underline"
    >
      Ввести іншу пошту
    </a>
  </div>
</div>
