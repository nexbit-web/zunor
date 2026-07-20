<!--
  Онбординг «Знайомство» — преміум glass на токенах теми.
  Логіка (нормалізація телефону, валідація, submit, avatar uploader) — 1:1.
  Безпека: вся валідація тут — UX; сервер /api/user/update має валідувати все повторно.
-->
<script lang="ts">
  import { untrack } from 'svelte'
  import { goto, invalidateAll } from '$app/navigation'
  import { cn } from '$lib/utils.js'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from '$lib/components/ui/select'
  import AvatarUploader from '$lib/components/avatar-uploader.svelte'
  // import { toast } from '$lib/stores/toast-store.svelte'
  import type { PageData } from './$types'
  import { LoaderCircle, CheckCircle2, AlertCircle } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import { Spinner } from '$lib/components/ui/spinner'
  
  import toast from 'svelte-hot-french-toast'

  let { data }: { data: PageData } = $props()

  const NAME_MAX = 80
  const BIO_MAX = 922

  // Телефон: тримаємо лише 9 значущих цифр; +380 додаємо при сабміті.
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

  const initial = untrack(() => data.user)

  let name = $state(initial.name ?? '')
  let city = $state(initial.city ?? '')
  let bio = $state(initial.bio ?? '')
  let avatarUrl = $state(initial.avatar ?? '')
  let avatarPublicId = $state('')
  let avatarUploading = $state(false)
  let phoneDigits = $state(normalizePhone(initial.phone ?? ''))
  let phoneTouched = $state(false)
  let submitting = $state(false)

  const phoneDisplayLocal = $derived(formatLocal(phoneDigits))

  function onPhoneInput(e: Event) {
    const el = e.currentTarget as HTMLInputElement
    phoneDigits = normalizePhone(el.value)
    // Примусова синхронізація DOM: інакше обрізаний зайвий символ лишається в полі.
    el.value = formatLocal(phoneDigits)
  }

  // Перша цифра укр. мобільного коду: 3, 5, 6, 7, 9.
  const phoneValid = $derived(
    phoneDigits.length === 9 && /^[35679]/.test(phoneDigits),
  )
  const phoneError = $derived(
    phoneTouched && !phoneValid
      ? phoneDigits.length === 0
        ? 'Введіть номер телефону'
        : 'Перевірте номер: +380 XX XXX XX XX'
      : '',
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
          // publicId: новий аватар → новий id; прибрали → null; просте редагування → не чіпаємо.
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
      await invalidateAll()
      await new Promise((r) => setTimeout(r, 800))
      goto('/dashboard')
      toast.success('Зміни збережено')
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
  class="welcome-scope flex min-h-svh items-start justify-center px-5 py-14 sm:py-16"
>
  <div class="flex w-full max-w-115 flex-col gap-5.5">
    <!-- intro -->
    <div class="text-center">
      <h1 class="text-3xl font-bold tracking-[-0.035em] text-foreground">
        Знайомство
      </h1>
      <p class="mt-2 text-[15px] leading-snug text-muted-foreground">
        Кілька слів про тебе — і можна замовляти.
      </p>
    </div>

    <!-- glass card -->
    <div
      class="rounded-[32px] border border-border bg-card px-7.5 pt-8.5 pb-7.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.1),0_8px_20px_-8px_rgba(0,0,0,0.05)]"
    >
      <!-- avatar -->
      <div class="mb-7 flex flex-col items-center gap-3">
        <AvatarUploader
          bind:value={avatarUrl}
          bind:publicId={avatarPublicId}
          bind:uploading={avatarUploading}
          fallback={avatarFallback}
          onError={(msg) => toast.error(msg)}
        />
        <span class="text-[13px] text-muted-foreground">Додай фото профілю</span
        >
      </div>

      <div class="flex flex-col gap-5">
        <!-- Імʼя -->
        <div class="flex flex-col gap-2.5">
          <label
            for="name"
            class="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground"
          >
            Як тебе звати?
          </label>
          <input
            id="name"
            type="text"
            bind:value={name}
            placeholder="Іван Петренко"
            maxlength={NAME_MAX}
            autocomplete="name"
            autocapitalize="words"
            class="welcome-input"
          />
        </div>

        <!-- Місто -->
        <div class="flex flex-col gap-2.5">
          <label
            for="city"
            class="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground"
          >
            Твоє місто
          </label>
          <Select type="single" bind:value={city}>
            <SelectTrigger id="city" class="welcome-input">
              <span class={cn('truncate', !city && 'text-muted-foreground')}
                >{cityLabel}</span
              >
            </SelectTrigger>
            <SelectContent class="rounded-2xl">
              {#each data.cities as c (c.slug)}
                <SelectItem value={c.slug} class="rounded-lg py-2.5 text-[15px]"
                  >{c.name}</SelectItem
                >
              {/each}
            </SelectContent>
          </Select>
        </div>

        <!-- Телефон -->
        <div class="flex flex-col gap-2.5">
          <label
            for="phone"
            class="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground"
          >
            Номер телефону
          </label>
          <div
            class={cn(
              'welcome-phone flex h-13 items-center overflow-hidden rounded-[14px]',
              phoneError && 'has-error',
            )}
          >
            <span
              class="flex h-full shrink-0 items-center border-r border-border pr-3 pl-4 font-semibold text-muted-foreground tabular-nums select-none"
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
              onblur={() => (phoneTouched = true)}
              placeholder="00 000 00 00"
              aria-invalid={!!phoneError}
              aria-describedby={phoneError ? 'phone-err' : 'phone-hint'}
              class="h-full flex-1 bg-transparent px-4 text-[15px] font-medium text-foreground tabular-nums outline-none placeholder:font-normal placeholder:text-muted-foreground"
            />
            {#if phoneTouched && phoneValid}
              <CheckCircle2
                class="mr-3.5 size-4.5 shrink-0 text-emerald-500"
                aria-hidden="true"
              />
            {:else if phoneError}
              <AlertCircle
                class="mr-3.5 size-4.5 shrink-0 text-destructive"
                aria-hidden="true"
              />
            {/if}
          </div>
          {#if phoneError}
            <p id="phone-err" class="text-[12.5px] text-destructive">
              {phoneError}
            </p>
          {:else}
            <p
              id="phone-hint"
              class="text-[12.5px] leading-snug text-muted-foreground"
            >
              Приватний. Майстер побачить його лише після того, як ти його
              обереш.
            </p>
          {/if}
        </div>

        <!-- Про себе -->
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <label
              for="bio"
              class="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground"
            >
              Про себе <span class="font-normal text-muted-foreground"
                >— необовʼязково</span
              >
            </label>
            <span class="text-[12px] tabular-nums text-muted-foreground"
              >{bio.length}/{BIO_MAX}</span
            >
          </div>
          <textarea
            id="bio"
            bind:value={bio}
            rows={3}
            maxlength={BIO_MAX}
            placeholder="Кілька слів про себе — майстру буде приємно знати, з ким працює"
            class="welcome-input min-h-23 resize-none py-3.5 leading-relaxed"
          ></textarea>
        </div>
      </div>

      <Button
        onclick={submit}
        disabled={!canSubmit}
        aria-busy={submitting}
        class="mt-7 relative inline-flex h-13.5 w-full items-center  justify-center rounded-[16px] text-[15.5px] font-semibold tracking-[-0.01em] text-white transition hover:-translate-y-px active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <span class="pointer-events-none">
          {#if submitting}
            Зачекайте…
          {:else}
            Готово
          {/if}
        </span>

        {#if submitting}
          <Spinner
            class="absolute right-4 animate-spin"
            aria-hidden="true"
          />
        {/if}
      </Button>
    </div>
  </div>
</div>

<style>
  
  

  /* Спільний вигляд input / select-trigger / textarea.
     :global бо клас потрапляє і на елемент усередині Select-компонента;
     обмежено .welcome-scope, щоб не текло на весь застосунок. */
  .welcome-scope :global(.welcome-input) {
    width: 100%;
    min-height: 52px;
    padding-left: 16px;
    padding-right: 16px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--muted);
    color: var(--foreground);
    font-size: 15px;
    font-weight: 500;
    outline: none;
    transition:
      border-color 0.16s ease,
      background 0.16s ease,
      box-shadow 0.16s ease;
  }
  .welcome-scope :global(.welcome-input::placeholder) {
    color: var(--muted-foreground);
    font-weight: 400;
  }
  .welcome-scope :global(.welcome-input:focus),
  .welcome-scope :global(.welcome-input:focus-within),
  .welcome-scope :global(.welcome-input[data-state='open']) {
    background: var(--background);
    border-color: var(--ring);
    box-shadow: 0 0 0 4px color-mix(in oklch, var(--ring) 22%, transparent);
  }

  /* Телефон — окрема рамка з префіксом. */
  .welcome-phone {
    border: 1px solid var(--border);
    background: var(--muted);
    transition:
      border-color 0.16s ease,
      background 0.16s ease,
      box-shadow 0.16s ease;
  }
  .welcome-phone:focus-within {
    border-color: var(--ring);
    background: var(--background);
    box-shadow: 0 0 0 4px color-mix(in oklch, var(--ring) 22%, transparent);
  }
  .welcome-phone.has-error {
    border-color: var(--destructive);
  }

  @media (prefers-reduced-motion: reduce) {
    .welcome-scope :global(.welcome-input),
    .welcome-phone {
      transition: none;
    }
  }
</style>
