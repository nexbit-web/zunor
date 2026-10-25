<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import FloatingInput from '$lib/components/forms/floating-input.svelte'
  import { Spinner } from '$lib/components/ui/spinner'
  import { authClient } from '$lib/auth-client'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { CircleAlert, Eye, EyeOff, ArrowLeft } from 'lucide-svelte'

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

    // Перевірка на натиск, а не на blur: кнопка лишається активною, і
    // причину видно під конкретним полем.
    touched = { password: true, confirm: true }
    if (!formValid) return

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
      serverError = "Помилка з'єднання. Перевірте інтернет."
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>Новий пароль — Zunor</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!-- Та сама розкладка, що на решті екранів входу: одна колонка по центру,
     без картки навколо форми. -->
<div
  class="relative flex min-h-svh flex-col items-center justify-center px-5 py-16"
>
  <a
    href="/"
    class="absolute start-5 top-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:start-8 sm:top-8"
  >
    <ArrowLeft size={18} aria-hidden="true" />
    Головна
  </a>

  <div class="w-full max-w-[480px]">
    {#if !tokenValid}
      <!-- ─── Посилання без токена ─── -->
      <div class="flex flex-col gap-4 text-center">
        <h1 class="text-2xl font-semibold">Посилання недійсне</h1>
        <p
          class="text-[15px] leading-relaxed text-balance text-muted-foreground"
        >
          Це посилання не містить валідного токена. Запросіть нове у формі
          відновлення паролю.
        </p>

        <Button
          href="/user/forgot"
          variant="primary"
          size="lg"
          class="mt-2 w-3/4 self-center"
        >
          Запросити нове посилання
        </Button>
      </div>
    {:else if success}
      <!-- ─── Пароль змінено ─── -->
      <div class="flex flex-col items-center gap-4 text-center">
        <h1 class="text-2xl font-semibold">Пароль змінено</h1>
        <p class="text-[15px] text-muted-foreground">
          Перенаправляємо на сторінку входу…
        </p>
        <Spinner class="size-5 animate-spin text-primary" aria-hidden="true" />
      </div>
    {:else}
      <!-- ─── Форма ─── -->
      <form
        onsubmit={handleSubmit}
        novalidate
        autocomplete="off"
        class="flex flex-col gap-4"
      >
        <div class="mb-1 flex flex-col gap-3 text-center">
          <h1 class="text-2xl font-semibold">Новий пароль</h1>
          <p
            class="text-[15px] leading-relaxed text-balance text-muted-foreground"
          >
            Придумайте пароль від восьми символів.
          </p>
        </div>

        <FloatingInput
          id="new-password"
          label="Новий пароль"
          type={showPassword ? 'text' : 'password'}
          bind:value={password}
          autocomplete="new-password"
          minlength={8}
          maxlength={128}
          error={passwordError}
          required
        >
          {#snippet trailing()}
            <button
              type="button"
              onclick={() => (showPassword = !showPassword)}
              class="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label={showPassword ? 'Сховати пароль' : 'Показати пароль'}
              aria-pressed={showPassword}
              tabindex={-1}
            >
              {#if showPassword}
                <EyeOff class="size-4.5" aria-hidden="true" />
              {:else}
                <Eye class="size-4.5" aria-hidden="true" />
              {/if}
            </button>
          {/snippet}
        </FloatingInput>

        <!-- Перемикача «показати» в другому полі немає: він один на обидва,
             інакше поруч стояли б дві кнопки з однаковою дією. -->
        <FloatingInput
          id="confirm-password"
          label="Повторіть пароль"
          type={showPassword ? 'text' : 'password'}
          bind:value={confirm}
          autocomplete="new-password"
          minlength={8}
          maxlength={128}
          error={confirmError}
          required
        />

        {#if serverError}
          <p
            role="alert"
            class="flex items-center justify-center gap-1.5 text-[13px] text-destructive"
          >
            <CircleAlert class="size-3.5 shrink-0" aria-hidden="true" />
            {serverError}
          </p>
        {/if}

        <Button
          variant="primary"
          size="lg"
          class="relative w-3/4 self-center"
          type="submit"
          disabled={loading}
          aria-busy={loading}
        >
          {#if loading}
            <Spinner class="animate-spin" aria-hidden="true" />
            <span class="sr-only">Зберігаємо...</span>
          {:else}
            <span>Зберегти пароль</span>
          {/if}
        </Button>

        <a
          href="/user/login"
          class="mt-1 text-center text-[15px] text-primary underline-offset-4 transition-colors hover:text-primary-hover hover:underline"
        >
          Повернутись до входу
        </a>
      </form>
    {/if}
  </div>
</div>
