<script lang="ts">
  import { authClient, signOut } from '$lib/auth-client'
  import { goto, invalidateAll } from '$app/navigation'
  import { page } from '$app/state'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { disconnectPusher } from '$lib/pusher-client'
  import { clearDialog } from '$lib/zunor/dialog-storage'
  import {
    SettingsGroup,
    SettingsRow,
    SettingsField,
    SettingsBlock,
  } from '$lib/components/settings'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Spinner } from '$lib/components/ui/spinner'
  import Eye from '$lib/components/icons/set/eye.svelte'
  import EyeOff from '$lib/components/icons/set/eye-off.svelte'
  import Check from '$lib/components/icons/set/check.svelte'
  import CircleAlert from '$lib/components/icons/set/circle-alert.svelte'
  import Lock from '$lib/components/icons/set/lock.svelte'
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

  // ─── Видалення акаунта ───
  // Підтвердження — своя пошта, введена руками (як назва репозиторію в
  // GitHub): дія незворотна, і один випадковий клік її не запускає.
  // Пароль не питаємо — у Google-акаунтів його немає.
  let deleteOpen = $state(false)
  let deleteEmail = $state('')
  let deleting = $state(false)
  let deleteError = $state('')

  const deleteMatches = $derived(
    deleteEmail.trim().toLowerCase() === data.email.trim().toLowerCase(),
  )

  function openDelete(): void {
    deleteEmail = ''
    deleteError = ''
    deleteOpen = true
  }

  async function deleteAccount(): Promise<void> {
    if (deleting || !deleteMatches) return
    deleting = true
    deleteError = ''

    try {
      const res = await fetch('/api/me', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: deleteEmail }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          message?: string
        } | null
        deleteError = j?.message ?? 'Не вдалося видалити акаунт'
        deleting = false
        return
      }
    } catch {
      deleteError = "Помилка з'єднання. Перевірте інтернет."
      deleting = false
      return
    }

    // Акаунт уже знеособлено на сервері — далі лише прибрати його сліди
    // з браузера. Збій тут нічого не повертає: сесії вже відкликані.
    const userId = page.data.session?.user?.id
    if (userId) clearDialog(userId)
    chatStore.unsubscribeAll()
    disconnectPusher()
    await signOut().catch(() => {})
    await invalidateAll().catch(() => {})
    await goto('/')
    // Сторінка змінилась на іншу — без тоста про подію ніде не сказано.
    toast('Акаунт видалено. Дякуємо, що були з нами.')
  }
</script>

<div>
  {#if data.hasPassword}
    <form onsubmit={submit} novalidate>
      <SettingsGroup
        title="Пароль"
        footnote="Інші сеанси буде завершено."
      >
        <SettingsField label="Поточний пароль" for="current-pw">
          {#snippet control()}
            <Input
              id="current-pw"
              type="password"
              icon={Lock}
              bind:value={current}
              autocomplete="current-password"
              placeholder="••••••••"
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
                icon={Lock}
                bind:value={next}
                onblur={() => (touched.next = true)}
                autocomplete="new-password"
                placeholder="••••••••"
                aria-invalid={!!nextError}
                class="pr-10"
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

        <SettingsField
          label="Повторіть пароль"
          for="confirm-pw"
          error={confirmError}
        >
          {#snippet control()}
            <div class="relative">
              <Input
                id="confirm-pw"
                type={showNext ? 'text' : 'password'}
                icon={Lock}
                bind:value={confirm}
                onblur={() => (touched.confirm = true)}
                autocomplete="new-password"
                placeholder="••••••••"
                aria-invalid={!!confirmError}
                class="pr-10"
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

        <!-- Кнопка всередині розділу, під полями: у дві колонки вона
             інакше опинялась би під лінією, вже в наступному розділі. -->
        <SettingsBlock>
          {#if serverError}
            <p
              class="mb-3 flex items-center gap-1.5 text-[12px] text-destructive"
              role="alert"
            >
              <CircleAlert class="size-3.5 shrink-0" aria-hidden="true" />
              {serverError}
            </p>
          {/if}

          <Button
            type="submit"
            disabled={saving || !formValid}
            aria-busy={saving}
            variant="primary"
            class="relative min-w-35"
          >
            {#if saving}
              <Spinner class="animate-spin" aria-hidden="true" />
              <span class="sr-only">Зберігаємо...</span>
            {:else}
              <span>Змінити пароль</span>
            {/if}
          </Button>
        </SettingsBlock>
      </SettingsGroup>
    </form>
  {:else}
    <!-- Акаунт створено через Google — пароля не існує.
         changePassword тут не спрацює: він перевіряє поточний пароль,
         якого немає. Тому пропонуємо задати перший через лист. -->
    <SettingsGroup title="Пароль">
      <SettingsRow
        label="Пароль не встановлено"
        description="Щоб входити й поштою — надішлемо посилання на {data.email}."
      >
        {#snippet control()}
          <Button
            onclick={sendSetPasswordLink}
            disabled={sendingReset}
            aria-busy={sendingReset}
            variant="secondary"
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

  <SettingsGroup title="Видалення акаунта">
    <SettingsRow
      label="Видалити акаунт"
      description={data.activeOrders > 0
        ? 'Спершу завершіть або скасуйте активні замовлення.'
        : 'Профіль і дані буде стерто назавжди.'}
    >
      {#snippet control()}
        {#if data.activeOrders > 0}
          <Button href="/dashboard/orders" variant="secondary">
            До замовлень
          </Button>
        {:else}
          <Button onclick={openDelete} variant="destructive">
            Видалити акаунт
          </Button>
        {/if}
      {/snippet}
    </SettingsRow>
  </SettingsGroup>
</div>

<AlertDialog.Root
  bind:open={
    () => deleteOpen,
    (v) => {
      // Поки запит іде, діалог не закривається: інакше людина не
      // побачила б, чим він скінчився.
      if (!deleting) deleteOpen = v
    }
  }
>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Видалити акаунт назавжди?</AlertDialog.Title>
      <AlertDialog.Description>
        Зникнуть імʼя, фото, профіль і способи входу, відкриті заявки й
        пропозиції буде скасовано. Завершені замовлення, листування й відгуки
        лишаться в інших людей під іменем «Видалений акаунт». Відновити
        акаунт не вийде.
      </AlertDialog.Description>
    </AlertDialog.Header>

    <form
      class="flex flex-col gap-2"
      onsubmit={(e) => {
        e.preventDefault()
        void deleteAccount()
      }}
    >
      <label for="delete-confirm" class="text-[13.5px] text-muted-foreground">
        Щоб підтвердити, введіть свою пошту
        <span class="font-medium break-all text-foreground">{data.email}</span>
      </label>
      <Input
        id="delete-confirm"
        type="email"
        bind:value={deleteEmail}
        autocomplete="off"
        spellcheck={false}
        disabled={deleting}
        aria-invalid={!!deleteError}
      />
      {#if deleteError}
        <p
          class="flex items-center gap-1.5 text-[12px] text-destructive"
          role="alert"
        >
          <CircleAlert class="size-3.5 shrink-0" aria-hidden="true" />
          {deleteError}
        </p>
      {/if}
    </form>

    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={deleting}>Скасувати</AlertDialog.Cancel>
      <AlertDialog.Action
        variant="destructive-filled"
        onclick={deleteAccount}
        disabled={deleting || !deleteMatches}
        aria-busy={deleting}
      >
        {#if deleting}
          <Spinner class="animate-spin" aria-hidden="true" />
          <span class="sr-only">Видаляємо…</span>
        {:else}
          Видалити
        {/if}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
