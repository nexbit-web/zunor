<!--
  Профіль виконавця. Одна сторінка, згруповані картки — як у System
  Settings: підпис ліворуч, контрол праворуч, роздільники з відступами.

  Валідація тут — виключно UX. Авторитет за сервером:
  saveMasterProfile() у $lib/server/profile.ts перевіряє все повторно.
-->
<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import { untrack, tick, type Snippet } from 'svelte'
  import { Button } from '$lib/components/ui/button'
  import { Spinner } from '$lib/components/ui/spinner'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Label } from '$lib/components/ui/label'
  import * as Popover from '$lib/components/ui/popover'
  import * as Command from '$lib/components/ui/command'
  import * as Alert from '$lib/components/ui/alert'
  import AvatarUploader from '$lib/components/avatar-uploader.svelte'
  import UsernameInput from '$lib/components/username-input.svelte'
  import PortfolioUploader from '$lib/components/portfolio-uploader.svelte'
  import { cn } from '$lib/utils'
  import toast from 'svelte-hot-french-toast'
  import CheckIcon from '@lucide/svelte/icons/check'
  import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down'
  import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
  import type { OnboardingData } from '$lib/components/onboarding/types'

  interface Props {
    data: OnboardingData
    /** onboarding — перше заповнення, edit — правка готового профілю. */
    mode: 'onboarding' | 'edit'
    onBack: () => void
  }

  let { data, mode, onBack }: Props = $props()

  const NAME_MIN = 2
  const NAME_MAX = 80
  const DESC_MIN = 50
  const DESC_MAX = 922
  /** Сервер приймає до 5. Змініть тут, якщо треба інакше. */
  const MAX_CATS = 3

  // untrack: початкові значення беремо один раз, інакше оновлення data
  // затирало б те, що людина щойно набрала.
  const initial = untrack(() => data.user)
  const mp = initial.masterProfile

  // ─── Поля ───
  let avatarUrl = $state(initial.avatar ?? '')
  let avatarPublicId = $state(initial.avatarPublicId ?? '')
  let avatarUploading = $state(false)

  let name = $state(initial.name ?? '')
  let username = $state(initial.username ?? '')
  let usernameValid = $state<boolean | null>(initial.username ? true : null)

  let city = $state(initial.city ?? '')
  let cityOpen = $state(false)
  let cityTriggerRef = $state<HTMLButtonElement>(null!)

  let categories = $state<string[]>(mp?.categories ?? [])
  let description = $state(mp?.description ?? '')

  let portfolioImages = $state<string[]>(mp?.portfolioImages ?? [])
  let portfolioImagesPublicIds = $state<string[]>(
    mp?.portfolioImagesPublicIds ?? [],
  )
  let portfolioUploading = $state(false)

  let submitting = $state(false)

  // Помилку показуємо лише після виходу з поля: червоне під порожнім
  // полем, якого ще не торкались, — це грубо.
  let touched = $state({ name: false, phone: false, city: false, desc: false })

  // ─── Телефон ───
  function normalizePhone(input: string): string {
    let d = input.replace(/\D/g, '')
    if (d.startsWith('380')) d = d.slice(3)
    else if (d.startsWith('80')) d = d.slice(2)
    else if (d.startsWith('0')) d = d.slice(1)
    return d.slice(0, 9)
  }

  function formatLocal(d: string): string {
    let out = d.slice(0, 2)
    if (d.length > 2) out += ' ' + d.slice(2, 5)
    if (d.length > 5) out += ' ' + d.slice(5, 7)
    if (d.length > 7) out += ' ' + d.slice(7, 9)
    return out
  }

  let phoneDigits = $state(normalizePhone(initial.phone ?? ''))
  const phoneDisplay = $derived(formatLocal(phoneDigits))

  function onPhoneInput(e: Event): void {
    const el = e.currentTarget as HTMLInputElement
    phoneDigits = normalizePhone(el.value)
    // Примусова синхронізація DOM: без неї курсор стрибає в кінець
    // при редагуванні середини номера.
    el.value = formatLocal(phoneDigits)
  }

  // Перша цифра укр. мобільного коду: 3, 5, 6, 7, 9.
  const phoneValid = $derived(
    phoneDigits.length === 9 && /^[35679]/.test(phoneDigits),
  )

  // ─── Похідні ───
  const nameTrim = $derived(name.trim())
  const nameValid = $derived(
    nameTrim.length >= NAME_MIN && nameTrim.length <= NAME_MAX,
  )
  const descTrim = $derived(description.trim())
  const descValid = $derived(
    descTrim.length >= DESC_MIN && descTrim.length <= DESC_MAX,
  )
  const cityName = $derived(data.cities.find((c) => c.slug === city)?.name ?? '')

  const nameError = $derived(
    touched.name && !nameValid
      ? nameTrim.length === 0
        ? "Введіть ім'я"
        : `Ім'я: ${NAME_MIN}–${NAME_MAX} символів`
      : '',
  )
  const phoneError = $derived(
    touched.phone && !phoneValid
      ? phoneDigits.length === 0
        ? 'Введіть номер'
        : 'Перевірте номер: +380 XX XXX XX XX'
      : '',
  )
  const cityError = $derived(touched.city && !city ? 'Оберіть місто' : '')
  const descError = $derived(
    touched.desc && !descValid
      ? descTrim.length < DESC_MIN
        ? `Ще ${DESC_MIN - descTrim.length} символів до мінімуму`
        : 'Опис задовгий'
      : '',
  )

  const formValid = $derived(
    nameValid &&
      usernameValid === true &&
      phoneValid &&
      !!city &&
      categories.length > 0 &&
      descValid,
  )

  const busy = $derived(submitting || avatarUploading || portfolioUploading)
  const wasRejected = $derived(mp?.verificationStatus === 'REJECTED')

  // ─── Дії ───
  function closeAndFocusTrigger(): void {
    cityOpen = false
    // tick: поповер ще в DOM на момент виклику, фокус без нього не сяде.
    tick().then(() => cityTriggerRef?.focus())
  }

  function toggleCategory(slug: string): void {
    if (categories.includes(slug)) {
      categories = categories.filter((c) => c !== slug)
      return
    }
    if (categories.length >= MAX_CATS) {
      toast.error(`Максимум ${MAX_CATS} категорії`)
      return
    }
    categories = [...categories, slug]
  }

  async function submit(e: SubmitEvent): Promise<void> {
    e.preventDefault()
    if (busy) return

    touched = { name: true, phone: true, city: true, desc: true }
    if (!formValid) {
      toast.error('Перевірте заповнені поля')
      return
    }

    submitting = true
    try {
      const res = await fetch('/api/profile/master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameTrim,
          username: username.trim(),
          phone: '+380' + phoneDigits,
          city,
          categories,
          description: descTrim,
          avatar: avatarUrl || null,
          avatarPublicId: avatarUrl ? avatarPublicId || null : null,
          portfolioImages,
          portfolioImagesPublicIds,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.message ?? json?.error ?? 'Не вдалося зберегти')
        return
      }

      await invalidateAll()
      toast.success(
        mode === 'edit' ? 'Зміни збережено' : 'Профіль надіслано на перевірку',
      )
      await goto('/dashboard')
    } catch {
      toast.error("Помилка з'єднання. Перевірте інтернет.")
    } finally {
      submitting = false
    }
  }
</script>

<!-- Рядок картки: підпис ліворуч, контрол праворуч.
     mx-4 замість divide-y — роздільник відступає від країв,
     як у системних налаштуваннях. -->
{#snippet row(
  label: string,
  forId: string | undefined,
  control: Snippet,
  hint?: string,
  error?: string,
)}
  <div
    class="mx-4 flex flex-col gap-2 border-t border-border/60 py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
  >
    <div class="min-w-0 sm:pt-1.5">
      {#if forId}
        <Label for={forId} class="text-sm font-normal">{label}</Label>
      {:else}
        <p class="text-sm">{label}</p>
      {/if}
      {#if hint}
        <p class="mt-0.5 max-w-[28ch] text-[12px] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      {/if}
    </div>

    <div class="w-full sm:w-[56%] sm:max-w-[300px] sm:shrink-0">
      {@render control()}
      {#if error}
        <p class="mt-1.5 text-[12px] text-destructive" role="alert">{error}</p>
      {/if}
    </div>
  </div>
{/snippet}

<div class="mx-auto w-full max-w-2xl px-4  ">
  <header class="mb-7">
    <h1 class="text-xl font-semibold tracking-[-0.02em]">
      {mode === 'edit' ? 'Профіль виконавця' : 'Заповніть профіль'}
    </h1>
    <p class="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
      {mode === 'edit'
        ? 'Зміни підуть на повторну перевірку.'
        : 'Клієнти бачитимуть ці дані, обираючи виконавця.'}
    </p>
  </header>

  {#if wasRejected && mp?.verificationRejectReason}
    <Alert.Root variant="destructive" class="mb-6">
      <AlertCircleIcon class="size-4" />
      <Alert.Title>Профіль не пройшов перевірку</Alert.Title>
      <Alert.Description>{mp.verificationRejectReason}</Alert.Description>
    </Alert.Root>
  {/if}

  <form onsubmit={submit} novalidate>
    <!-- ═══ Основне ═══ -->
    <h2 class="mb-2 px-1 text-sm font-semibold">Основне</h2>
    <div class="rounded-xl bg-muted/40 py-1">
      {#snippet avatarControl()}
        <AvatarUploader
          bind:value={avatarUrl}
          bind:publicId={avatarPublicId}
          bind:uploading={avatarUploading}
          fallback={nameTrim.charAt(0).toUpperCase() || '?'}
          onError={(msg) => toast.error(msg)}
        />
      {/snippet}
      {@render row('Фото', undefined, avatarControl, 'З фото відгукуються охочіше')}

      {#snippet nameControl()}
        <Input
          id="name"
          bind:value={name}
          onblur={() => (touched.name = true)}
          placeholder="Олена Коваленко"
          maxlength={NAME_MAX}
          autocomplete="name"
          aria-invalid={!!nameError}
          class="bg-background"
          required
        />
      {/snippet}
      {@render row("Ім'я", 'name', nameControl, undefined, nameError)}

      {#snippet usernameControl()}
        <UsernameInput
          bind:value={username}
          bind:isValid={usernameValid}
          currentUsername={initial.username ?? ''}
        />
      {/snippet}
      {@render row('Username', 'username', usernameControl, 'Адреса вашого профілю')}

      {#snippet phoneControl()}
        <div class="flex items-center gap-2">
          <span class="flex h-9 shrink-0 items-center rounded-md bg-background px-2.5 text-sm text-muted-foreground">
            +380
          </span>
          <Input
            id="phone"
            value={phoneDisplay}
            oninput={onPhoneInput}
            onblur={() => (touched.phone = true)}
            placeholder="67 123 45 67"
            inputmode="tel"
            autocomplete="tel-national"
            aria-invalid={!!phoneError}
            class="bg-background"
            required
          />
        </div>
      {/snippet}
      {@render row(
        'Телефон',
        'phone',
        phoneControl,
        'Видно клієнту після підтвердження',
        phoneError,
      )}

      {#snippet cityControl()}
        <!-- Combobox: Popover + Command, як у документації shadcn-svelte -->
        <Popover.Root bind:open={cityOpen}>
          <Popover.Trigger bind:ref={cityTriggerRef}>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="outline"
                role="combobox"
                aria-expanded={cityOpen}
                aria-invalid={!!cityError}
                class="w-full justify-between bg-background font-normal"
              >
                <span class={cn(!cityName && 'text-muted-foreground')}>
                  {cityName || 'Оберіть місто'}
                </span>
                <ChevronsUpDownIcon class="opacity-50" />
              </Button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Content class="w-[--bits-popover-anchor-width] p-0">
            <Command.Root>
              <Command.Input placeholder="Пошук міста..." />
              <Command.List>
                <Command.Empty>Місто не знайдено</Command.Empty>
                <Command.Group>
                  {#each data.cities as c (c.slug)}
                    <!-- value = назва, щоб пошук працював по тому,
                         що людина бачить, а не по slug -->
                    <Command.Item
                      value={c.name}
                      onSelect={() => {
                        city = c.slug
                        touched.city = true
                        closeAndFocusTrigger()
                      }}
                    >
                      <CheckIcon class={cn(city !== c.slug && 'text-transparent')} />
                      {c.name}
                    </Command.Item>
                  {/each}
                </Command.Group>
              </Command.List>
            </Command.Root>
          </Popover.Content>
        </Popover.Root>
      {/snippet}
      {@render row('Місто', undefined, cityControl, undefined, cityError)}
    </div>

    <!-- ═══ Спеціалізація ═══ -->
    <h2 class="mt-7 mb-2 px-1 text-sm font-semibold">Спеціалізація</h2>
    <div class="rounded-xl bg-muted/40 py-1">
      <div class="mx-4 py-3">
        <p class="text-sm">Що ви виконуєте</p>
        <p class="mt-0.5 text-[12px] text-muted-foreground">
          До {MAX_CATS} категорій. Заявки надходитимуть лише з них.
        </p>

        <!-- Чіпи замість меню: усі варіанти видно одразу, вибір у клік.
             aria-pressed, а не checkbox — кнопка-перемикач читається
             скрінрідером як «натиснуто / не натиснуто». -->
        <div class="mt-3 flex flex-wrap gap-2">
          {#each data.categories as c (c.slug)}
            {@const selected = categories.includes(c.slug)}
            <button
              type="button"
              onclick={() => toggleCategory(c.slug)}
              aria-pressed={selected}
              class={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[13px] transition-colors',
                selected
                  ? 'bg-foreground text-background'
                  : 'bg-background text-foreground hover:bg-accent',
              )}
            >
              {#if selected}
                <CheckIcon class="size-3.5" aria-hidden="true" />
              {/if}
              {c.name}
            </button>
          {/each}
        </div>
      </div>

      <div class="mx-4 border-t border-border/60 py-3">
        <Label for="description" class="text-sm font-normal">Про себе</Label>
        <Textarea
          id="description"
          bind:value={description}
          onblur={() => (touched.desc = true)}
          placeholder="Досвід, що саме робите, чим відрізняєтесь від інших."
          rows={5}
          maxlength={DESC_MAX}
          aria-invalid={!!descError}
          class="mt-2 resize-none bg-background"
          required
        />
        <div class="mt-1.5 flex items-start justify-between gap-4">
          {#if descError}
            <p class="text-[12px] text-destructive" role="alert">{descError}</p>
          {:else}
            <p class="text-[12px] text-muted-foreground">
              Мінімум {DESC_MIN} символів.
            </p>
          {/if}
          <span class="shrink-0 text-[12px] tabular-nums text-muted-foreground">
            {descTrim.length}/{DESC_MAX}
          </span>
        </div>
      </div>
    </div>

    <!-- ═══ Портфоліо ═══ -->
    <h2 class="mt-7 mb-2 px-1 text-sm font-semibold">Портфоліо</h2>
    <div class="rounded-xl bg-muted/40 py-1">
      <div class="mx-4 py-3">
        <p class="text-sm">Приклади робіт</p>
        <p class="mt-0.5 mb-3 text-[12px] text-muted-foreground">
          Необов'язково. Фото «до / після» працюють найкраще.
        </p>
        <PortfolioUploader
          bind:images={portfolioImages}
          bind:publicIds={portfolioImagesPublicIds}
          bind:uploading={portfolioUploading}
          maxItems={6}
          onError={(msg) => toast.error(msg)}
        />
      </div>
    </div>

    <!-- ═══ Дії ═══
         У кінці форми, праворуч — як у діалогах macOS.
         Підтверджувальна дія остання: погляд іде зліва направо
         й закінчується на тому, що людина хоче натиснути. -->
    <div class="mt-7 flex items-center justify-end gap-2">
      {#if avatarUploading || portfolioUploading}
        <span class="mr-auto text-[12px] text-muted-foreground">
          Фото ще завантажуються...
        </span>
      {/if}

      <Button type="button" variant="ghost" onclick={onBack} disabled={busy}>
        Скасувати
      </Button>

      <Button
        type="submit"
        disabled={busy || !formValid}
        aria-busy={submitting}
        class="relative  "
      >
        <span>
          {submitting ? 'Зберігаємо...' : mode === 'edit' ? 'Зберегти' : 'Надіслати'}
        </span>
        {#if submitting}
          <Spinner class="absolute size-4 right-1" aria-hidden="true" />
        {/if}
      </Button>
    </div>
  </form>
</div>