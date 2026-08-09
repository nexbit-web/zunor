<!--
  Профіль замовника. Згруповані картки — як у System Settings:
  підпис ліворуч, контрол праворуч, роздільники з відступами.

  Валідація тут — виключно UX. Авторитет за сервером:
  saveClientProfile() у $lib/server/profile.ts перевіряє все повторно.
-->
<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import { untrack, tick } from 'svelte'
  import {
    SettingsGroup,
    SettingsField,
    SettingsBlock,
  } from '$lib/components/settings'
  import { Button } from '$lib/components/ui/button'
  import { Spinner } from '$lib/components/ui/spinner'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Label } from '$lib/components/ui/label'
  import * as Popover from '$lib/components/ui/popover'
  import * as Command from '$lib/components/ui/command'
  import AvatarUploader from '$lib/components/avatar-uploader.svelte'
  import { cn } from '$lib/utils'
  import toast from 'svelte-hot-french-toast'
  import CheckIcon from '@lucide/svelte/icons/check'
  import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down'
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
  const BIO_MAX = 922

  // untrack: початкові значення беремо один раз, інакше оновлення data
  // затирало б те, що людина щойно набрала.
  const initial = untrack(() => data.user)

  // ─── Поля ───
  let avatarUrl = $state(initial.avatar ?? '')
  let avatarPublicId = $state(initial.avatarPublicId ?? '')
  let avatarUploading = $state(false)

  let name = $state(initial.name ?? '')
  let bio = $state(initial.bio ?? '')

  let city = $state(initial.city ?? '')
  let cityOpen = $state(false)
  let cityTriggerRef = $state<HTMLButtonElement>(null!)

  let submitting = $state(false)

  // Помилку показуємо лише після виходу з поля: червоне під порожнім
  // полем, якого ще не торкались, — це грубо.
  let touched = $state({ name: false, phone: false, city: false })

  // ─── Телефон ───
  // Тримаємо лише 9 значущих цифр; +380 додаємо при сабміті.
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
    // Примусова синхронізація DOM: без неї обрізаний зайвий символ
    // лишається в полі.
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
  const bioTrim = $derived(bio.trim())
  const cityName = $derived(
    data.cities.find((c) => c.slug === city)?.name ?? '',
  )

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

  const formValid = $derived(nameValid && phoneValid && !!city)
  const busy = $derived(submitting || avatarUploading)

  // ─── Дії ───
  function closeAndFocusTrigger(): void {
    cityOpen = false
    // tick: поповер ще в DOM на момент виклику, фокус без нього не сяде.
    tick().then(() => cityTriggerRef?.focus())
  }

  async function submit(e: SubmitEvent): Promise<void> {
    e.preventDefault()
    if (busy) return

    touched = { name: true, phone: true, city: true }
    if (!formValid) {
      toast.error('Перевірте заповнені поля')
      return
    }

    submitting = true
    try {
      // role та onboarded не шлемо: сервер виставляє їх сам після
      // валідації. Клієнт не має права на ці поля.
      const res = await fetch('/api/profile/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameTrim,
          phone: '+380' + phoneDigits,
          city,
          bio: bioTrim,
          avatar: avatarUrl || null,
          avatarPublicId: avatarUrl ? avatarPublicId || null : null,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.message ?? json?.error ?? 'Не вдалося зберегти')
        return
      }

      await invalidateAll()
      toast.success(mode === 'edit' ? 'Зміни збережено' : 'Профіль заповнено!')
      await goto('/dashboard')
    } catch {
      toast.error("Помилка з'єднання. Перевірте інтернет.")
    } finally {
      submitting = false
    }
  }
</script>

<!-- Локальний сніпет row прибрано: це був той самий рядок, що й
     SettingsField у налаштуваннях, скопійований сюди разом із класами.
     Форма профілю і /settings/profile — той самий екран, тож і рядок
     у них має бути один. -->

<div class="mx-auto w-full max-w-2xl">
  <header class="mb-7">
    <h1 class="text-xl font-semibold tracking-[-0.02em]">
      {mode === 'edit' ? 'Профіль' : 'Знайомство'}
    </h1>
    <p class="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
      {mode === 'edit'
        ? 'Ці дані бачить виконавець після підтвердження замовлення.'
        : 'Кілька полів — і можна оформлювати заявку.'}
    </p>
  </header>

  <form onsubmit={submit} novalidate>
    <!-- ═══ Основне ═══ -->
    <SettingsGroup title="Основне">
      <SettingsField label="Фото" hint="Необов'язково">
        {#snippet control()}
          <AvatarUploader
            bind:value={avatarUrl}
            bind:publicId={avatarPublicId}
            bind:uploading={avatarUploading}
            fallback={nameTrim.charAt(0).toUpperCase() || 'U'}
            onError={(msg) => toast.error(msg)}
          />
        {/snippet}
      </SettingsField>

      <SettingsField label="Ім'я" for="name" error={nameError}>
        {#snippet control()}
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
      </SettingsField>

      <SettingsField
        label="Телефон"
        for="phone"
        hint="Видно виконавцю після підтвердження"
        error={phoneError}
      >
        {#snippet control()}
          <div class="flex items-center gap-2">
            <span
              class="flex h-9 shrink-0 items-center rounded-md bg-background px-2.5 text-sm text-muted-foreground"
            >
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
      </SettingsField>

      <SettingsField
        label="Місто"
        hint="Заявки надходитимуть виконавцям звідси"
        error={cityError}
      >
        {#snippet control()}
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
                        <CheckIcon
                          class={cn(city !== c.slug && 'text-transparent')}
                        />
                        {c.name}
                      </Command.Item>
                    {/each}
                  </Command.Group>
                </Command.List>
              </Command.Root>
            </Popover.Content>
          </Popover.Root>
        {/snippet}
      </SettingsField>
    </SettingsGroup>

    <!-- ═══ Додатково ═══ -->
    <SettingsGroup title="Додатково">
      <SettingsBlock>
        <Label for="bio" class="text-sm font-normal">Про себе</Label>
        <p class="mt-0.5 text-[12px] text-muted-foreground">
          Необов'язково. Наприклад: є кіт, під'їзд із кодом, зручніше зранку.
        </p>
        <Textarea
          id="bio"
          bind:value={bio}
          placeholder="Що виконавцю варто знати заздалегідь."
          rows={4}
          maxlength={BIO_MAX}
          class="mt-2 resize-none bg-background"
        />
        <!-- Лічильник лише коли є що рахувати: «0/922» під порожнім полем
             читається як помилка. Так само зроблено в анкеті асистента. -->
        {#if bioTrim.length > 0}
          <div class="mt-1.5 flex justify-end">
            <span class="text-[12px] tabular-nums text-muted-foreground">
              {bioTrim.length}/{BIO_MAX}
            </span>
          </div>
        {/if}
      </SettingsBlock>
    </SettingsGroup>

    <!-- ═══ Дії ═══
         У кінці форми, праворуч — як у діалогах macOS.
         Підтверджувальна дія остання: погляд іде зліва направо
         й закінчується на тому, що людина хоче натиснути. -->
    <div class="mt-7 flex items-center justify-end gap-2">
      {#if avatarUploading}
        <span class="mr-auto text-[12px] text-muted-foreground">
          Фото ще завантажується...
        </span>
      {/if}

      <Button type="button" variant="ghost" onclick={onBack} disabled={busy}>
        Скасувати
      </Button>

      <Button
        type="submit"
        disabled={busy || !formValid}
        aria-busy={submitting}
        class="relative min-w-[130px]"
      >
        <span>
          {submitting
            ? 'Зберігаємо...'
            : mode === 'edit'
              ? 'Зберегти'
              : 'Продовжити'}
        </span>
        {#if submitting}
          <Spinner class="absolute right-3 animate-spin" aria-hidden="true" />
        {/if}
      </Button>
    </div>
  </form>
</div>
