<script lang="ts">
  // Форма входу в подачі ClickUp: Google зверху, під «або» — пошта й
  // пароль, кнопка входу, «Забули пароль?». Заголовок і посилання на
  // реєстрацію малює AuthShell над формою.
  //
  // Проміжного кроку «оберіть спосіб входу» більше немає: два способи
  // видно одразу, і людина, що входить поштою, не клацає зайвий раз.
  import { cn } from '$lib/utils.js'
  import type { HTMLFormAttributes } from 'svelte/elements'
  import { signIn } from '$lib/auth-client'
  import { goto, invalidateAll } from '$app/navigation'
  import { dev } from '$app/environment'
  import { Button } from './ui/button'
  import { Input } from './ui/input'
  import { Spinner } from './ui/spinner'
  import FieldError from './forms/field-error.svelte'
  import GoogleButton from './auth/google-button.svelte'
  import PasswordInput from './auth/password-input.svelte'
  import toast from 'svelte-hot-french-toast'
  import { page } from '$app/state'
  import { safeRedirectTarget } from '$lib/utils/redirect'
  import { WaveHelloIcon } from '$lib/components/icons'
  let { class: className, ...restProps }: HTMLFormAttributes = $props()
  const id = $props.id()

  // ─── State ───
  let email = $state('')
  let password = $state('')
  let loading = $state(false)
  let googleLoading = $state(false)
  let serverError = $state('')
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
  const urlErrorText = $derived(
    urlError === 'banned'
      ? 'Доступ до акаунта обмежено. Напишіть у підтримку.'
      : urlError === 'oauth'
        ? 'Не вдалося увійти через Google. Спробуйте ще раз.'
        : '',
  )

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading || googleLoading) return

    // Позначаємо поля як «торкнуті» саме тут: до першого натиску
    // помилок немає, підпис під полем з'являється рівно на спробу увійти.
    touched = { email: true, password: true }
    if (!formValid) return
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
  class={cn('flex flex-col', className)}
  onsubmit={handleSubmit}
  novalidate
  autocomplete="on"
  {...restProps}
>
  {#if urlErrorText}
    <div class="mb-4 flex justify-center">
      <FieldError text={urlErrorText} />
    </div>
  {/if}

  <GoogleButton
    onclick={handleGoogle}
    loading={googleLoading}
    disabled={loading}
  />

  <div
    class="my-4 flex items-center gap-3 text-[13px] leading-5 text-muted-foreground"
    role="separator"
  >
    <span class="h-px flex-1 bg-border"></span>
    або
    <span class="h-px flex-1 bg-border"></span>
  </div>

  <!-- Підпис полів — у плейсхолдері, як у ClickUp; для скрінрідера він
       дублюється aria-label, бо плейсхолдер підписом не вважається. -->
  <div class="flex flex-col gap-3">
    <div>
      <Input
        id="email-{id}"
        type="email"
        inputmode="email"
        autocapitalize="none"
        autocomplete="email"
        spellcheck="false"
        placeholder="Робоча електронна пошта"
        aria-label="Робоча електронна пошта"
        bind:value={email}
        maxlength={254}
        aria-invalid={!!emailError}
        aria-describedby={emailError ? `email-${id}-error` : undefined}
        class="h-9 rounded-[8px]"
        required
      />
      <FieldError id="email-{id}-error" text={emailError} />
    </div>

    <div>
      <PasswordInput
        id="password-{id}"
        bind:value={password}
        autocomplete="current-password"
        errorId={passwordError ? `password-${id}-error` : undefined}
      />
      <FieldError id="password-{id}-error" text={passwordError} />
    </div>

    {#if serverError}
      <div class="flex justify-center">
        <FieldError text={serverError} />
      </div>
    {/if}

    <!-- Кнопка активна завжди, крім часу запиту. Заблокована кнопка не
         каже, ЧОМУ вона заблокована: людина бачить сірий прямокутник і
         мусить сама здогадатись, яке поле не так заповнене. Тому
         перевірка спрацьовує на натиск і підписує конкретне поле. -->
    <Button
      variant="primary"
      size="lg"
      class="relative w-full"
      type="submit"
      disabled={loading || googleLoading}
      aria-busy={loading}
    >
      {#if loading}
        <Spinner class="animate-spin" aria-hidden="true" />
        <span class="sr-only">Зачекайте...</span>
      {:else}
        <span>Увійти</span>
      {/if}
    </Button>
  </div>

  <a
    href="/user/forgot"
    class="mx-auto mt-2 rounded-sm text-[14px] text-primary underline-offset-4 transition-colors hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
  >
    Забули пароль?
  </a>
</form>
