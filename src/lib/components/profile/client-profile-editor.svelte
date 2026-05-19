<!-- src/lib/components/profile/client-profile-editor.svelte -->
<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import { Button } from '$lib/components/ui/button'
  import { Spinner } from '$lib/components/ui/spinner'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import * as Field from '$lib/components/ui/field'
  import * as Popover from '$lib/components/ui/popover'
  import * as Command from '$lib/components/ui/command'
  import AvatarUploader from '$lib/components/avatar-uploader.svelte'
  import UsernameInput from '$lib/components/username-input.svelte'
  import { cn } from '$lib/utils'
  import { tick } from 'svelte'
  import toast from 'svelte-hot-french-toast'
  import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left'
  import CheckIcon from '@lucide/svelte/icons/check'
  import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down'
  import CircleCheckBigIcon from '@lucide/svelte/icons/circle-check-big'

  interface ClientUser {
    id: string
    email: string
    name: string | null
    username: string | null
    phone: string | null
    avatar: string | null
    avatarPublicId: string | null
    city: string | null
    bio: string | null
  }

  interface CityOption {
    slug: string
    name: string
    region?: string | null
    isCapital?: boolean
  }

  let {
    user,
    cities,
  }: {
    user: ClientUser
    cities: CityOption[]
  } = $props()

  const BIO_MAX = 922

  // ─── Avatar ───
  let avatarUrl = $state(user.avatar ?? '')
  let avatarPublicId = $state(user.avatarPublicId ?? '')
  let avatarUploading = $state(false)

  // ─── Поля ───
  let name = $state(user.name ?? '')
  let username = $state(user.username ?? '')
  let usernameValid = $state<boolean | null>(user.username ? true : null)
  let phone = $state(user.phone ?? '')
  let bio = $state(user.bio ?? '')

  // ─── City picker ───
  let city = $state(user.city ?? '')
  let cityOpen = $state(false)
  let cityTriggerRef = $state<HTMLButtonElement>(null!)

  let submitting = $state(false)
  let success = $state(false)

  const nameTrimmed = $derived(name.trim())
  const bioTrimmed = $derived(bio.trim())
  const cityName = $derived(cities.find((c) => c.slug === city)?.name ?? '')

  const canSubmit = $derived(
    !submitting &&
      !avatarUploading &&
      nameTrimmed.length >= 1 &&
      nameTrimmed.length <= 80 &&
      usernameValid === true &&
      !!city,
  )

  function initials() {
    return (nameTrimmed || user.email || '?')[0]?.toUpperCase() ?? '?'
  }

  function selectCity(slug: string) {
    city = slug
    cityOpen = false
    tick().then(() => cityTriggerRef?.focus())
  }

  function leave() {
    goto('/dashboard')
  }

  async function submit() {
    if (!canSubmit) return
    submitting = true

    try {
      // 1) Аватар — отдельный endpoint
      if (
        avatarUrl &&
        avatarPublicId &&
        avatarPublicId !== user.avatarPublicId
      ) {
        await fetch('/api/user/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'avatar',
            url: avatarUrl,
            publicId: avatarPublicId,
          }),
        }).catch(() => {})
      }

      // 2) Остальные поля
      const res = await fetch('/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameTrimmed,
          username,
          phone: phone.trim() || undefined,
          city,
          bio: bioTrimmed,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error ?? 'Не вдалось зберегти')
        return
      }

      success = true
      toast.success('Зміни збережено!')
      await invalidateAll()
      await new Promise((r) => setTimeout(r, 600))
      goto('/dashboard')
    } catch {
      toast.error('Помилка зʼєднання')
    } finally {
      submitting = false
    }
  }
</script>

<div
  class="min-h-svh px-4 pt-6 pb-20 md:py-14"
  style="background-color: var(--background)"
>
  <div class="max-w-lg mx-auto">
    <!-- Top bar -->
    <div class="flex items-center justify-between mb-10">
      <button
        type="button"
        onclick={leave}
        class="inline-flex items-center gap-2 text-sm cursor-pointer transition-opacity hover:opacity-60"
        style="color: var(--muted-foreground)"
      >
        <ArrowLeftIcon class="size-4" />
        Назад
      </button>
    </div>

    <!-- Header -->
    <header class="mb-8">
      <p
        class="text-xs uppercase tracking-widest font-medium mb-3"
        style="color: var(--muted-foreground)"
      >
        Профіль
      </p>
      <h1
        class="text-3xl sm:text-4xl font-bold tracking-tight mb-2"
        style="color: var(--foreground); letter-spacing: -0.02em"
      >
        Редагування профілю
      </h1>
      <p style="color: var(--muted-foreground)">
        Ваші дані видно майстрам у заявках та повідомленнях
      </p>
    </header>

    <Field.Group>
      <!-- Avatar -->
      <Field.Field>
        <Field.Label>Фото профілю</Field.Label>
        <div class="flex items-center gap-4">
          <AvatarUploader
            bind:value={avatarUrl}
            bind:publicId={avatarPublicId}
            bind:uploading={avatarUploading}
            fallback={initials()}
            onError={(msg) => toast.error(msg)}
          />
          <p class="text-sm" style="color: var(--muted-foreground)">
            Клікніть на фото щоб завантажити.<br />JPG, PNG до 5 МБ.
          </p>
        </div>
      </Field.Field>

      <!-- Name -->
      <Field.Field>
        <Field.Label for="name">Імʼя</Field.Label>
        <Input
          id="name"
          type="text"
          placeholder="Іван Петренко"
          bind:value={name}
          maxlength={80}
          class="h-11"
        />
      </Field.Field>

      <!-- Username -->
      <UsernameInput
        bind:value={username}
        bind:isValid={usernameValid}
        currentUsername={user.username ?? ''}
      />

      <!-- Phone -->
      <Field.Field>
        <Field.Label for="phone">
          Телефон
          <span
            class="text-[10px] font-normal uppercase tracking-wide ml-1.5"
            style="color: var(--muted-foreground)"
          >
            Опц.
          </span>
        </Field.Label>
        <Input
          id="phone"
          type="tel"
          placeholder="+380 67 123 45 67"
          bind:value={phone}
          maxlength={30}
          class="h-11"
        />
        <Field.Description>
          Телефон видно тільки вам, не публічно
        </Field.Description>
      </Field.Field>

      <!-- City -->
      <Field.Field>
        <Field.Label>Місто</Field.Label>
        <Popover.Root bind:open={cityOpen}>
          <Popover.Trigger bind:ref={cityTriggerRef}>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="outline"
                role="combobox"
                aria-expanded={cityOpen}
                class={cn(
                  'w-full h-11 justify-between font-normal',
                  !city && 'text-muted-foreground',
                )}
              >
                {cityName || 'Оберіть місто'}
                <ChevronsUpDownIcon class="opacity-50" />
              </Button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Content
            class="w-(--bits-popover-anchor-width) p-0"
            align="start"
            sideOffset={6}
          >
            <Command.Root>
              <Command.Input placeholder="Пошук міста..." />
              <Command.List>
                <Command.Empty>Нічого не знайдено</Command.Empty>
                <Command.Group>
                  {#each cities as c (c.slug)}
                    <Command.Item
                      value={c.name}
                      onSelect={() => selectCity(c.slug)}
                    >
                      <CheckIcon
                        class={cn(city !== c.slug && 'text-transparent')}
                      />
                      {c.name}
                      {#if c.region}
                        <span class="ml-auto text-xs text-muted-foreground">
                          {c.region}
                        </span>
                      {/if}
                    </Command.Item>
                  {/each}
                </Command.Group>
              </Command.List>
            </Command.Root>
          </Popover.Content>
        </Popover.Root>
        <Field.Description>
          Майстри побачать ваші заявки тільки якщо вони працюють у вашому місті
        </Field.Description>
      </Field.Field>

      <!-- Bio -->
      <Field.Field>
        <div class="flex items-baseline justify-between">
          <Field.Label for="bio">
            Про себе
            <span
              class="text-[10px] font-normal uppercase tracking-wide ml-1.5"
              style="color: var(--muted-foreground)"
            >
              Опц.
            </span>
          </Field.Label>
          <span
            class={cn(
              'text-[11px] tabular-nums',
              bioTrimmed.length > BIO_MAX * 0.9
                ? 'text-destructive'
                : 'text-muted-foreground',
            )}
          >
            {bioTrimmed.length}/{BIO_MAX}
          </span>
        </div>
        <Textarea
          id="bio"
          placeholder="Розкажіть коротко про себе"
          bind:value={bio}
          maxlength={BIO_MAX}
          rows={4}
          class="resize-none"
        />
      </Field.Field>
    </Field.Group>

    <!-- Save button -->
    <div
      class="flex items-center justify-end gap-3 mt-10 pt-6"
      style="border-top: 1px solid var(--border)"
    >
      <Button
        variant="ghost"
        onclick={leave}
        disabled={submitting}
        class="h-11"
      >
        Скасувати
      </Button>
      <Button
        onclick={submit}
        disabled={!canSubmit || success}
        class="gap-2 h-11 min-w-40 rounded-xl"
      >
        {#if success}
          <CircleCheckBigIcon class="size-4" />
          Збережено!
        {:else if submitting}
          <Spinner />
          Зберігаємо...
        {:else}
          Зберегти зміни
          <CheckIcon class="size-4" />
        {/if}
      </Button>
    </div>
  </div>
</div>
