<!-- src/routes/(auth)/welcome/+page.svelte -->
<script lang="ts">
  import { untrack } from 'svelte'
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
  import AvatarUploader from '$lib/components/avatar-uploader.svelte'
  import { toast } from '$lib/stores/toast-store.svelte'
  import type { PageData } from './$types'
  import { Spinner } from '$lib/components/ui/spinner'

  let { data }: { data: PageData } = $props()

  const NAME_MAX = 80
  const BIO_MAX = 922

  // Телефон: тримаємо лише 9 значущих цифр оператора; +380 додаємо при сабміті.
  // Нормалізуємо будь-який ввід (380…, 80…, 0…, …) до цих 9 цифр.
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

  // Початкові значення форми — знімаємо один раз; далі поля редагуються локально.
  const initial = untrack(() => data.user)

  let name = $state(initial.name ?? '')
  let city = $state(initial.city ?? '')
  let bio = $state(initial.bio ?? '')
  let avatarUrl = $state(initial.avatar ?? '')
  let avatarPublicId = $state('')
  let avatarUploading = $state(false)
  let phoneDigits = $state(normalizePhone(initial.phone ?? ''))
  let submitting = $state(false)

  const phoneDisplayLocal = $derived(formatLocal(phoneDigits))

  function onPhoneInput(e: Event) {
    const el = e.target as HTMLInputElement
    phoneDigits = normalizePhone(el.value)
    // Інакше відкинуті символи лишаються у полі вводу.
    el.value = formatLocal(phoneDigits)
  }

  // Перша цифра укр. мобільного коду: 3, 5, 6, 7, 9.
  const phoneValid = $derived(
    phoneDigits.length === 9 && /^[35679]/.test(phoneDigits),
  )

  const nameTrimmed = $derived(name.trim())
  const avatarFallback = $derived(
    nameTrimmed ? nameTrimmed[0].toUpperCase() : 'U',
  )

  const canSubmit = $derived(
    !submitting &&
      !avatarUploading &&
      nameTrimmed.length >= 1 &&
      nameTrimmed.length <= NAME_MAX &&
      !!city &&
      phoneValid,
  )

  const cityLabel = $derived(
    data.cities.find((c) => c.slug === city)?.name ?? 'Оберіть місто',
  )

  async function submit() {
    if (!canSubmit) return
    submitting = true

    try {
      const res = await fetch('/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameTrimmed,
          city,
          phone: '+380' + phoneDigits,
          bio: bio.trim(),
          avatar: avatarUrl || null,
          // publicId оновлюємо лише коли є що оновлювати: новий аватар → новий id;
          // прибрали аватар → null; просте редагування → не чіпаємо.
          ...(avatarUrl
            ? avatarPublicId
              ? { avatarPublicId }
              : {}
            : { avatarPublicId: null }),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error ?? 'Не вдалось зберегти')
        return
      }
      toast.success('Вітаю! Тепер можна замовляти')
      await invalidateAll()
      await new Promise((r) => setTimeout(r, 800))
      goto('/dashboard')
    } catch {
      toast.error('Помилка зʼєднання')
    } finally {
      submitting = false
    }
  }
</script>

<svelte:head>
  <title>Знайомство · Zunor</title>
</svelte:head>

<div
  class="min-h-svh px-5 py-10 sm:py-16"
  style="background-color: var(--background)"
>
  <div class="max-w-md mx-auto">
    <h1
      class="text-3xl sm:text-4xl font-bold tracking-tight mb-3"
      style="color: var(--foreground); letter-spacing: -0.03em"
    >
      Знайомство
    </h1>
    <p class="text-base mb-10" style="color: var(--muted-foreground)">
      Кілька слів про тебе — і можна замовляти. Це швидко.
    </p>

    <div class="flex justify-center mb-10">
      <AvatarUploader
        bind:value={avatarUrl}
        bind:publicId={avatarPublicId}
        bind:uploading={avatarUploading}
        fallback={avatarFallback}
        onError={(msg) => toast.error(msg)}
      />
    </div>

    <div class="space-y-7">
      <!-- Імʼя -->
      <div>
        <Label
          for="name"
          class="text-sm font-semibold mb-2.5 block"
          style="color: var(--foreground)"
        >
          Як тебе звати?
        </Label>
        <Input
          id="name"
          type="text"
          bind:value={name}
          placeholder="Іван Петренко"
          maxlength={NAME_MAX}
          autocomplete="name"
          class="h-12 text-base"
        />
      </div>

      <!-- Місто -->
      <div>
        <Label
          for="city"
          class="text-sm font-semibold mb-2.5 block"
          style="color: var(--foreground)"
        >
          Твоє місто
        </Label>
        <Select type="single" bind:value={city}>
          <SelectTrigger
            id="city"
            class="h-12 text-base data-placeholder:text-muted-foreground"
          >
            {cityLabel}
          </SelectTrigger>
          <SelectContent class="rounded-xl">
            {#each data.cities as c (c.slug)}
              <SelectItem value={c.slug} class="text-base py-2.5"
                >{c.name}</SelectItem
              >
            {/each}
          </SelectContent>
        </Select>
      </div>

      <!-- Телефон -->
      <div>
        <Label
          for="phone"
          class="text-sm font-semibold mb-2.5 block"
          style="color: var(--foreground)"
        >
          Номер телефону
        </Label>
        <div
          class="flex items-center h-12 rounded-md border bg-transparent text-base focus-within:ring-2 focus-within:ring-ring/50 transition-shadow"
          style="border-color: var(--input)"
        >
          <span
            class="pl-3 pr-2 shrink-0 select-none tabular-nums"
            style="color: var(--muted-foreground)"
          >
            +380
          </span>
          <input
            id="phone"
            type="tel"
            inputmode="numeric"
            autocomplete="tel-national"
            value={phoneDisplayLocal}
            oninput={onPhoneInput}
            placeholder="00 000 00 00"
            class="flex-1 h-full bg-transparent outline-none pr-3 tabular-nums"
            style="color: var(--foreground)"
          />
        </div>
        <p class="text-xs mt-2" style="color: var(--muted-foreground)">
          Приватний. Майстер побачить його лише після того, як ти його обереш.
        </p>
      </div>

      <!-- Про себе -->
      <div>
        <Label
          for="bio"
          class="text-sm font-semibold mb-2.5 block"
          style="color: var(--foreground)"
        >
          Про себе
          <span class="font-normal" style="color: var(--muted-foreground)"
            >— необовʼязково</span
          >
        </Label>
        <Textarea
          id="bio"
          bind:value={bio}
          rows={3}
          maxlength={BIO_MAX}
          placeholder="Кілька слів про себе — майстру буде приємно знати, з ким працює"
          class="resize-none text-base"
        />
      </div>
    </div>

    <Button
      onclick={submit}
      disabled={!canSubmit}
      class="w-full h-12 rounded-xl mt-10 text-base font-semibold"
    >
      {#if submitting}
        <Spinner /> Зберігаємо…
      {:else}
        Готово
      {/if}
    </Button>
  </div>
</div>
