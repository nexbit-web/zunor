<!-- src/routes/(auth)/welcome/+page.svelte -->
<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { Textarea } from '$lib/components/ui/textarea'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from '$lib/components/ui/select'
  import { Card, CardContent } from '$lib/components/ui/card'
  import AvatarUploader from '$lib/components/avatar-uploader.svelte'
  import UsernameInput from '$lib/components/username-input.svelte'
  import { Sparkles, ArrowRight, XCircle } from 'lucide-svelte'
  import type { PageData } from './$types'
  import { Spinner } from '$lib/components/ui/spinner'

  let { data }: { data: PageData } = $props()

  // ─── State — все строки, без null (важно для $bindable) ───
  let name = $state(data.user.name ?? '')
  let username = $state(data.user.username ?? '')
  let usernameValid = $state<boolean | null>(data.user.username ? true : null)
  let city = $state(data.user.city ?? '')
  let phone = $state(data.user.phone ?? '')
  let bio = $state(data.user.bio ?? '')

  // Аватар — отдельные state для $bindable пропсов
  let avatarUrl = $state(data.user.avatar ?? '')
  let avatarPublicId = $state('')
  let avatarUploading = $state(false)

  let submitting = $state(false)
  let errorMsg = $state<string | null>(null)

  const nameTrimmed = $derived(name.trim())
  const cityTrimmed = $derived(city.trim())

  const avatarFallback = $derived(
    nameTrimmed ? nameTrimmed[0].toUpperCase() : 'U',
  )

  const canSubmit = $derived(
    !submitting &&
      !avatarUploading &&
      nameTrimmed.length >= 1 &&
      nameTrimmed.length <= 80 &&
      usernameValid === true &&
      !!cityTrimmed,
  )

  const cityLabel = $derived(
    data.cities.find((c) => c.slug === city)?.name ?? 'Оберіть місто',
  )

  async function submit() {
    if (!canSubmit) return
    submitting = true
    errorMsg = null

    try {
      const res = await fetch('/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameTrimmed,
          username,
          city: cityTrimmed,
          phone: phone.trim() || undefined,
          bio: bio.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        errorMsg = json?.error ?? 'Не вдалось зберегти'
        return
      }
      await invalidateAll()
      goto('/dashboard')
    } catch {
      errorMsg = 'Помилка зʼєднання'
    } finally {
      submitting = false
    }
  }
</script>

<svelte:head>
  <title>Завершіть профіль · Zunor</title>
</svelte:head>

<div class="max-w-xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
  <!-- Hero -->
  <div class="text-center mb-8">
    <div
      class="size-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
      style="background-color: color-mix(in oklch, var(--primary) 12%, transparent)"
    >
      <Sparkles class="size-6" style="color: var(--primary)" />
    </div>
    <h1
      class="text-2xl sm:text-3xl font-bold tracking-tight mb-2"
      style="color: var(--foreground); letter-spacing: -0.02em"
    >
      Майже готово!
    </h1>
    <p class="text-sm" style="color: var(--muted-foreground)">
      Заповніть профіль — щоб майстри знали, з ким мають справу
    </p>
  </div>

  <Card class="rounded-2xl">
    <CardContent class="p-5 sm:p-6 space-y-5">
      <!-- Avatar -->
      <div class="flex justify-center">
        <AvatarUploader
          bind:value={avatarUrl}
          bind:publicId={avatarPublicId}
          bind:uploading={avatarUploading}
          fallback={avatarFallback}
          onError={(msg) => (errorMsg = msg)}
        />
      </div>

      <!-- Name -->
      <div>
        <Label for="name" class="text-sm font-semibold mb-2 block">
          Імʼя <span style="color: var(--destructive)">*</span>
        </Label>
        <Input
          id="name"
          type="text"
          bind:value={name}
          placeholder="Іван Петренко"
          maxlength={80}
        />
      </div>

      <!-- Username (компонент уже включает Label и подсказку) -->
      <UsernameInput
        bind:value={username}
        bind:isValid={usernameValid}
        currentUsername={data.user.username ?? ''}
      />

      <!-- City -->
      <div>
        <Label for="city" class="text-sm font-semibold mb-2 block">
          Місто <span style="color: var(--destructive)">*</span>
        </Label>
        <Select type="single" bind:value={city}>
          <SelectTrigger id="city">
            {cityLabel}
          </SelectTrigger>
          <SelectContent>
            {#each data.cities as c (c.slug)}
              <SelectItem value={c.slug}>{c.name}</SelectItem>
            {/each}
          </SelectContent>
        </Select>
        <p class="text-xs mt-1.5" style="color: var(--muted-foreground)">
          Майстри побачать ваші заявки тільки якщо вони працюють у вашому місті
        </p>
      </div>

      <!-- Phone -->
      <div>
        <Label for="phone" class="text-sm font-semibold mb-2 block">
          Телефон
          <span class="font-normal" style="color: var(--muted-foreground)">
            — необовʼязково
          </span>
        </Label>
        <Input
          id="phone"
          type="tel"
          bind:value={phone}
          placeholder="+380 50 123 45 67"
          maxlength={20}
        />
      </div>

      <!-- Bio -->
      <div>
        <Label for="bio" class="text-sm font-semibold mb-2 block">
          Про себе
          <span class="font-normal" style="color: var(--muted-foreground)">
            — необовʼязково
          </span>
        </Label>
        <Textarea
          id="bio"
          bind:value={bio}
          rows={3}
          maxlength={922}
          placeholder="Розкажіть коротко про себе"
          class="resize-none"
        />
        <p
          class="text-xs mt-1.5 text-right tabular-nums"
          style="color: var(--muted-foreground)"
        >
          {bio.length} / 922
        </p>
      </div>

      <!-- Error -->
      {#if errorMsg}
        <div
          class="text-xs flex items-start gap-2 rounded-lg px-3 py-2.5"
          style="background-color: color-mix(in srgb, var(--destructive) 10%, transparent); color: var(--destructive)"
        >
          <XCircle class="size-3.5 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      {/if}

      <!-- Submit -->
      <Button
        onclick={submit}
        disabled={!canSubmit}
        class="w-full h-11 rounded-full gap-2"
      >
        {#if submitting}
          <Spinner />
          Зберігаємо…
        {:else}
          Завершити <ArrowRight class="size-4" />
        {/if}
      </Button>
    </CardContent>
  </Card>
</div>
