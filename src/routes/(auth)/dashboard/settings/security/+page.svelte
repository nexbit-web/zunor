<script lang="ts">
  import { authClient } from '$lib/auth-client'
  import { goto } from '$app/navigation'
  import {
    SettingsGroup,
    SettingsRow,
    SettingsField,
  } from '$lib/components/settings'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Spinner } from '$lib/components/ui/spinner'
  import { Eye, EyeOff, Check } from 'lucide-svelte'
  import toast from 'svelte-hot-french-toast'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  const MIN_LEN = 8

  let current = $state('')
  let next = $state('')
  let confirm = $state('')
  let showNext = $state(false)
  let saving = $state(false)
  let serverError = $state('')
  let touched = $state({ next: false, confirm: false })

  const lengthOk = $derived(next.length >= MIN_LEN)
  const differs = $derived(next.length > 0 && next !== current)
  const matches = $derived(confirm.length > 0 && confirm === next)

  const nextError = $derived(
    touched.next && next.length > 0 && !lengthOk
      ? `Мінімум ${MIN_LEN} символів`
      : touched.next && next.length > 0 && !differs
        ? 'Новий пароль збігається зі старим'
        : '',
  )
  const confirmError = $derived(
    touched.confirm && confirm.length > 0 && !matches
      ? 'Паролі не збігаються'
      : '',
  )

  const formValid = $derived(
    current.length > 0 && lengthOk && differs && matches,
  )

  async function submit(e: SubmitEvent): Promise<void> {
    e.preventDefault()
    if (saving || !formValid) return

    saving = true
    serverError = ''

    try {
      // revokeOtherSessions: зміна пароля зазвичай означає, що доступ
      // міг витекти — інші пристрої треба вигнати. Поточна сесія живе далі.
      const { error: err } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      })

      if (err) {
        // 400 тут — майже завжди невірний поточний пароль.
        serverError =
          err.status === 400
            ? 'Поточний пароль невірний'
            : err.status === 429
              ? 'Забагато спроб. Спробуйте пізніше.'
              : 'Не вдалося змінити пароль'
        return
      }

      current = ''
      next = ''
      confirm = ''
      touched = { next: false, confirm: false }
      toast.success('Пароль змінено. Інші пристрої відключено.')
    } catch {
      serverError = "Помилка з'єднання. Перевірте інтернет."
    } finally {
      saving = false
    }
  }

  // Для Google-акаунтів без пароля: лист зі скиданням і є способом
  // задати перший пароль — окремого клієнтського API для цього немає.
  let sendingReset = $state(false)

  async function sendSetPasswordLink(): Promise<void> {
    if (sendingReset) return
    sendingReset = true

    try {
      const { error: err } = await authClient.requestPasswordReset({
        email: data.email,
        redirectTo: '/user/reset-password',
      })
      if (err) {
        toast.error('Не вдалося надіслати лист')
        return
      }
      toast.success(`Лист надіслано на ${data.email}`)
    } catch {
      toast.error("Помилка з'єднання")
    } finally {
      sendingReset = false
    }
  }
</script>

<div>
  {#if data.hasPassword}
    <form onsubmit={submit} novalidate>
      <SettingsGroup
        title="Пароль"
        footnote="Після зміни ви лишитесь у системі на цьому пристрої, а всі інші сеанси буде завершено."
      >
        <SettingsField label="Поточний пароль" for="current-pw">
          {#snippet control()}
            <Input
              id="current-pw"
              type="password"
              bind:value={current}
              autocomplete="current-password"
              placeholder="••••••••"
              class="bg-background"
              required
            />
          {/snippet}
        </SettingsField>

        <SettingsField
          label="Новий пароль"
          hint="Мінімум {MIN_LEN} символів"
          for="new-pw"
          error={nextError}
        >
          {#snippet control()}
            <div class="relative">
              <Input
                id="new-pw"
                type={showNext ? 'text' : 'password'}
                bind:value={next}
                onblur={() => (touched.next = true)}
                autocomplete="new-password"
                placeholder="••••••••"
                aria-invalid={!!nextError}
                class="bg-background pr-10"
                required
              />
              <button
                type="button"
                onclick={() => (showNext = !showNext)}
                class="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label={showNext ? 'Сховати пароль' : 'Показати пароль'}
                aria-pressed={showNext}
              >
                {#if showNext}
                  <EyeOff class="size-4" aria-hidden="true" />
                {:else}
                  <Eye class="size-4" aria-hidden="true" />
                {/if}
              </button>
            </div>
          {/snippet}
        </SettingsField>

        <SettingsField label="Ще раз" for="confirm-pw" error={confirmError}>
          {#snippet control()}
            <div class="relative">
              <Input
                id="confirm-pw"
                type={showNext ? 'text' : 'password'}
                bind:value={confirm}
                onblur={() => (touched.confirm = true)}
                autocomplete="new-password"
                placeholder="••••••••"
                aria-invalid={!!confirmError}
                class="bg-background pr-10"
                required
              />
              {#if matches}
                <Check
                  class="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
              {/if}
            </div>
          {/snippet}
        </SettingsField>
      </SettingsGroup>

      {#if serverError}
        <p class="-mt-4 mb-4 px-1 text-[12.5px] text-destructive" role="alert">
          {serverError}
        </p>
      {/if}

      <div class="-mt-2 mb-7 flex justify-end">
        <Button
          type="submit"
          disabled={saving || !formValid}
          aria-busy={saving}
          class="relative min-w-[150px]"
        >
          <span>{saving ? 'Зберігаємо...' : 'Змінити пароль'}</span>
          {#if saving}
            <Spinner
              class="absolute right-3 size-3 animate-spin"
              aria-hidden="true"
            />
          {/if}
        </Button>
      </div>
    </form>
  {:else}
    <!-- Акаунт створено через Google — пароля не існує.
         changePassword тут не спрацює: він перевіряє поточний пароль,
         якого немає. Тому пропонуємо задати перший через лист. -->
    <SettingsGroup title="Пароль">
      <SettingsRow
        label="Пароль не встановлено"
        description="Ви входите через Google. Щоб додати вхід поштою, задайте пароль — надішлемо посилання на {data.email}."
      >
        {#snippet control()}
          <Button
            variant="outline"
            onclick={sendSetPasswordLink}
            disabled={sendingReset}
            aria-busy={sendingReset}
            class="bg-background"
          >
            {sendingReset ? 'Надсилаємо...' : 'Задати пароль'}
          </Button>
        {/snippet}
      </SettingsRow>
    </SettingsGroup>
  {/if}

  <SettingsGroup title="Способи входу">
    <SettingsRow label="Пошта і пароль">
      {#snippet control()}
        <span class="text-[13px] text-muted-foreground">
          {data.hasPassword ? 'Увімкнено' : 'Не налаштовано'}
        </span>
      {/snippet}
    </SettingsRow>

    <SettingsRow label="Google">
      {#snippet control()}
        <span class="text-[13px] text-muted-foreground">
          {data.hasGoogle ? 'Прив’язано' : 'Не прив’язано'}
        </span>
      {/snippet}
    </SettingsRow>
  </SettingsGroup>
</div>
