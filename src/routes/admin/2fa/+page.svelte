<!--
  Вхід в адмінку: код другого фактора. Та сама рамка, що на вході,
  реєстрації й відновленні пароля (AuthShell): пастельний відсвіт угорі,
  знак Zunor, заголовок і колонка 400px. Шапки й підвалу сайту немає —
  кореневий лейаут ховає їх на /admin/**.

  Першого разу — QR для застосунку-автентифікатора; далі лише код. Шість
  цифр відправляються самі, щойно введена остання.
-->
<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import toast from 'svelte-hot-french-toast'
  import * as InputOTP from '$lib/components/ui/input-otp/index.js'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Spinner } from '$lib/components/ui/spinner'
  import AuthShell from '$lib/components/auth/auth-shell.svelte'
  import QrCode from '$lib/components/admin/qr-code.svelte'
  import { copyToClipboard } from '$lib/utils/clipboard'
  import { signOutAndGo } from '$lib/utils/sign-out'
  import CircleAlert from '$lib/components/icons/set/circle-alert.svelte'
  import Copy from '$lib/components/icons/set/copy.svelte'
  import type { ActionData, PageData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  const CODE_LENGTH = 6

  let code = $state('')
  let sending = $state(false)
  let showKey = $state(false)
  let formEl = $state<HTMLFormElement>()

  // `?/verify` замінює весь query, тож redirectTo переносимо руками —
  // інакше після коду людина опинялась би на огляді, а не там, куди йшла.
  const action = $derived.by(() => {
    const to = page.url.searchParams.get('redirectTo')
    return to ? `?/verify&redirectTo=${encodeURIComponent(to)}` : '?/verify'
  })

  function submit() {
    if (!sending && code.length === CODE_LENGTH) formEl?.requestSubmit()
  }

  // Вийти з акаунта — щоб зайти іншим (звичайним). «На сайт» є лише в
  // того, хто має анкету: без неї /dashboard веде назад сюди (hooks).
  let leaving = $state(false)
  async function leave(): Promise<void> {
    if (leaving) return
    leaving = true
    try {
      await signOutAndGo('/')
    } catch {
      leaving = false
      toast.error('Не вдалося вийти. Спробуйте ще раз.')
    }
  }

  // Посилання — як «Увійти» / «Забули пароль?» на сторінках входу.
  const LINK =
    'rounded-sm text-primary underline-offset-4 transition-colors hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50'
</script>

<svelte:head>
  <title>Вхід в адмінку — Zunor</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<AuthShell
  title={data.mode === 'setup' ? 'Захистіть вхід в адмінку' : 'Вхід в адмінку'}
  mark="blink"
>
  {#snippet subtitle()}
    {#if data.mode === 'setup'}
      Відскануйте код у Google Authenticator, 1Password чи Authy й введіть
      шість цифр, які він покаже.
    {:else}
      Введіть код <span class="text-foreground">Zunor Admin</span> із
      застосунку-автентифікатора.
    {/if}
  {/snippet}

  {#if data.mode === 'setup'}
    <div class="mt-2 mb-5 flex flex-col items-center gap-3">
      <QrCode
        size={data.qr.size}
        cells={data.qr.cells}
        label="QR-код для застосунку-автентифікатора"
        class="w-[228px]"
      />

      {#if showKey}
        <div class="relative w-full">
          <label for="totp-key" class="sr-only">Ключ для ручного введення</label>
          <Input
            id="totp-key"
            readonly
            value={data.secret}
            class="h-9 rounded-[8px] pe-10 font-mono text-[13.5px] tracking-wider"
            onfocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            class="absolute end-1 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Скопіювати ключ"
            onclick={() => copyToClipboard(data.secret.replace(/\s+/g, ''), 'Ключ скопійовано')}
          >
            <Copy size={16} />
          </button>
        </div>
        <p class="-mt-1 text-[13px] text-muted-foreground">
          У застосунку оберіть «Ввести ключ» і тип «За часом».
        </p>
      {:else}
        <button type="button" class="text-[14px] {LINK}" onclick={() => (showKey = true)}>
          Не сканується? Ввести ключ вручну
        </button>
      {/if}
    </div>
  {/if}

  <form
    bind:this={formEl}
    method="POST"
    {action}
    class="flex flex-col gap-3"
    use:enhance={() => {
      sending = true
      return async ({ result, update }) => {
        await update({ reset: false })
        sending = false
        // Невірний код — поле порожнє для нової спроби.
        if (result.type === 'failure') code = ''
      }
    }}
  >
    <input type="hidden" name="code" value={code} />
    <label for="admin-otp" class="sr-only">Код із застосунку</label>
    <InputOTP.Root
      id="admin-otp"
      maxlength={CODE_LENGTH}
      bind:value={code}
      onComplete={submit}
      aria-invalid={!!form?.error}
      aria-describedby={form?.error ? 'admin-otp-err' : undefined}
      class="justify-center"
    >
      {#snippet children({ cells })}
        <!-- Одна група без роздільника, як на підтвердженні пошти. -->
        <InputOTP.Group class="gap-2 sm:gap-2.5">
          {#each cells as cell (cell)}
            <InputOTP.Slot
              {cell}
              class="size-11 rounded-[10px]! border! text-xl shadow-none sm:size-12"
            />
          {/each}
        </InputOTP.Group>
      {/snippet}
    </InputOTP.Root>

    <!-- Місце під помилку зарезервоване: її поява не зсуває кнопку. -->
    <div class="min-h-5 text-center">
      {#if form?.error}
        <p
          id="admin-otp-err"
          role="alert"
          class="flex items-center justify-center gap-1.5 text-[13px] text-destructive"
        >
          <CircleAlert class="size-3.5 shrink-0" aria-hidden="true" />
          {form.error}
        </p>
      {/if}
    </div>

    <Button
      variant="primary"
      size="lg"
      class="w-full"
      type="submit"
      disabled={sending || code.length < CODE_LENGTH}
      aria-busy={sending}
    >
      {#if sending}
        <Spinner class="animate-spin" aria-hidden="true" />
        <span class="sr-only">Перевіряємо...</span>
      {:else}
        Увійти в адмінку
      {/if}
    </Button>
  </form>

  <div class="mt-4 flex items-center justify-center gap-4 text-[14px]">
    {#if data.staff.onSite}
      <a href="/dashboard" class={LINK}>На сайт</a>
      <span class="text-muted-foreground/50" aria-hidden="true">·</span>
    {/if}
    <button type="button" class={LINK} disabled={leaving} onclick={leave}>
      {leaving ? 'Виходимо...' : 'Вийти з акаунта'}
    </button>
  </div>

  {#snippet footer()}
    <p class="text-center text-[13px] text-muted-foreground/75">
      Загубили телефон? Код скидає інший адміністратор.
    </p>
  {/snippet}
</AuthShell>
