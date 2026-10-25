<!--
  Профіль замовника — у двох подачах з одним станом:

  • onboarding — покроковий майстер (OnboardingWizard): імʼя, місто з
    районом, телефон і необовʼязкове «ще трохи про вас». Замовника ведуть за
    руку (MANIFESTO.md, розділ 7): він не професіонал, і чотири коротких
    питання для нього легші за анкету одним екраном;
  • edit — та сама форма одним екраном на сторінці налаштувань.

  Поля описані сніпетами один раз і збираються в обидві подачі. Профіль
  зберігається ОДНИМ запитом у кінці: сервер ставить onboarded лише після
  повної перевірки.

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
  import OnboardingWizard from './onboarding-wizard.svelte'
  import DistrictSelect from './district-select.svelte'
  import { cityDistricts, findDistrict } from '$lib/geo/districts'
  import { cn } from '$lib/utils'
  import toast from 'svelte-hot-french-toast'
  import CheckIcon from '@lucide/svelte/icons/check'
  import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down'
  import { UserRound, Phone, MapPin } from 'lucide-svelte'
  import type {
    OnboardingData,
    WizardStep,
  } from '$lib/components/onboarding/types'

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

  // Обовʼязкове — спершу, необовʼязкове — одним кроком наприкінці, який
  // можна пропустити: до заявки людину не тримає ніщо зайве.
  const STEPS: readonly WizardStep[] = [
    {
      id: 'name',
      title: 'Як вас звати?',
      subtitle: 'Так до вас звертатиметься майстер.',
    },
    {
      id: 'city',
      title: 'Де ви живете?',
      subtitle:
        'Заявку спершу побачать майстри з вашого району й сусідніх — вони приїдуть швидше. Точну адресу ви повідомите в чаті.',
    },
    {
      id: 'phone',
      title: 'Ваш номер телефону',
      subtitle:
        'Його побачить лише майстер, якого ви оберете, — і лише після підтвердження замовлення.',
    },
    {
      id: 'extras',
      title: 'Ще трохи про вас',
      subtitle: 'Необовʼязково, але так майстру простіше підготуватися.',
      optional: true,
    },
  ]

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
  let district = $state(initial.district ?? '')

  let submitting = $state(false)
  let step = $state(0)

  // Помилку показуємо лише після виходу з поля (або спроби піти далі):
  // червоне під порожнім полем, якого ще не торкались, — це грубо.
  let touched = $state({
    name: false,
    phone: false,
    city: false,
    district: false,
  })

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

  // Район питаємо лише там, де для міста є райони в БД (зараз — Одеса).
  const districts = $derived(cityDistricts(data.districts, city))
  const needsDistrict = $derived(districts.length > 0)
  const districtValid = $derived(
    !needsDistrict || !!findDistrict(districts, district),
  )
  const districtError = $derived(
    touched.district && !districtValid ? 'Оберіть район' : '',
  )

  const formValid = $derived(nameValid && phoneValid && !!city && districtValid)
  const busy = $derived(submitting || avatarUploading)
  const busyNote = $derived(avatarUploading ? 'Фото ще завантажується...' : '')

  // ─── Кроки ───
  /**
   * Перевірка перед «Далі»: поле кроку стає «торкнутим», тож якщо
   * чогось бракує, підпис під полем зʼявляється саме зараз.
   */
  function validateStep(id: string): boolean {
    switch (id) {
      case 'name':
        touched.name = true
        return nameValid
      case 'city':
        touched.city = true
        touched.district = true
        return !!city && districtValid
      case 'phone':
        touched.phone = true
        return phoneValid
      default:
        return true
    }
  }

  // ─── Дії ───
  function closeAndFocusTrigger(): void {
    cityOpen = false
    // tick: поповер ще в DOM на момент виклику, фокус без нього не сяде.
    tick().then(() => cityTriggerRef?.focus())
  }

  async function save(): Promise<void> {
    if (busy) return

    touched = { name: true, phone: true, city: true, district: true }
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
          district: needsDistrict ? district : null,
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
      toast.success(
        mode === 'edit'
          ? 'Зміни збережено'
          : 'Готово! Тепер можна замовити прибирання',
      )
      await goto('/dashboard')
    } catch {
      toast.error("Помилка з'єднання. Перевірте інтернет.")
    } finally {
      submitting = false
    }
  }
</script>

<!-- ═══════════════ Поля ═══════════════
     Кожне поле — один сніпет, спільний для майстра кроків і форми
     редагування. Підписи й помилки дає обгортка (SettingsField). -->

{#snippet photoControl()}
  <AvatarUploader
    bind:value={avatarUrl}
    bind:publicId={avatarPublicId}
    bind:uploading={avatarUploading}
    fallback={nameTrim.charAt(0).toUpperCase() || 'U'}
    onError={(msg) => toast.error(msg)}
  />
{/snippet}

{#snippet nameControl()}
  <Input
    id="name"
    icon={UserRound}
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

{#snippet phoneControl()}
  <!-- +380 стоїть у самому полі й не стирається: у value лише 9 цифр
       номера, код країни додається при збереженні. -->
  <Input
    id="phone"
    icon={Phone}
    prefixText="+380"
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
{/snippet}

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
          class="w-full cursor-pointer justify-between rounded-[10px] bg-background pl-3 font-normal focus-visible:border-input focus-visible:ring-0 aria-invalid:ring-0"
        >
          <span class="flex min-w-0 items-center gap-2">
            <MapPin
              class="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span class={cn('truncate', !cityName && 'text-muted-foreground')}>
              {cityName || 'Оберіть місто'}
            </span>
          </span>
          <ChevronsUpDownIcon class="opacity-50" />
        </Button>
      {/snippet}
    </Popover.Trigger>
    <!-- w-(--var), а не w-[--var]: у Tailwind 4 квадратні дужки — це
         довільне ЗНАЧЕННЯ, і `[--bits-popover-anchor-width]` не давало
         жодної валідної ширини. Список через це вирівнювався по
         власному вмісту й був вужчий за кнопку. -->
    <Popover.Content class="w-(--bits-popover-anchor-width) p-0">
      <Command.Root>
        <Command.Input placeholder="Пошук міста..." />
        <Command.List>
          <Command.Empty>Місто не знайдено</Command.Empty>
          <Command.Group>
            {#each data.cities as c (c.slug)}
              <!-- value = назва, щоб пошук працював по тому, що людина
                   бачить, а не по slug -->
              <Command.Item
                value={c.name}
                class="cursor-pointer [&_.cn-command-item-indicator]:hidden"
                onSelect={() => {
                  city = c.slug
                  touched.city = true
                  // Район іншого міста тут нічого не означає.
                  if (
                    !findDistrict(
                      cityDistricts(data.districts, c.slug),
                      district,
                    )
                  ) {
                    district = ''
                  }
                  closeAndFocusTrigger()
                }}
              >
                {c.name}
                <!-- Галочка праворуч, назва притиснута ліворуч: усі міста
                     починаються з однієї вертикалі, інакше рядок із
                     галочкою зсунутий відносно решти. ! — бо підсвічений
                     рядок перефарбовує свої іконки (data-selected:*:[svg]). -->
                <CheckIcon
                  class={cn(
                    'ms-auto text-primary!',
                    city !== c.slug && 'text-transparent!',
                  )}
                />
              </Command.Item>
            {/each}
          </Command.Group>
        </Command.List>
      </Command.Root>
    </Popover.Content>
  </Popover.Root>
{/snippet}

{#snippet districtControl()}
  <DistrictSelect
    {districts}
    bind:value={district}
    invalid={!!districtError}
    onpick={() => (touched.district = true)}
  />
{/snippet}

{#snippet bioControl()}
  <!-- Пояснення живе в плейсхолдері: окремий абзац під підписом казав би
       те саме, що й приклад усередині поля. -->
  <Textarea
    id="bio"
    bind:value={bio}
    placeholder="Необов'язково: є кіт, під'їзд із кодом, зручніше зранку."
    rows={3}
    maxlength={BIO_MAX}
    class="resize-none bg-background"
  />
  <!-- Лічильник зʼявляється лише біля стелі: доки до неї далеко, він
       відповідає на питання, якого ніхто не ставив. -->
  {#if bioTrim.length > BIO_MAX * 0.8}
    <div class="mt-1.5 flex justify-end">
      <span class="text-[12px] tabular-nums text-muted-foreground">
        {bioTrim.length}/{BIO_MAX}
      </span>
    </div>
  {/if}
{/snippet}

<!-- ═══════════════ Майстер кроків ═══════════════ -->

{#snippet stepContent(id: string)}
  {#if id === 'name'}
    <SettingsField
      label="Ім'я"
      for="name"
      error={nameError}
      control={nameControl}
    />
  {:else if id === 'city'}
    <SettingsField label="Місто" error={cityError} control={cityControl} />
    {#if needsDistrict}
      <SettingsField
        label="Район"
        for="district"
        error={districtError}
        control={districtControl}
      />
    {/if}
  {:else if id === 'phone'}
    <SettingsField
      label="Телефон"
      for="phone"
      error={phoneError}
      control={phoneControl}
    />
  {:else if id === 'extras'}
    <SettingsField label="Фото" control={photoControl} />
    <SettingsBlock>
      <Label for="bio" class="mb-2 text-[14px] font-medium">Про себе</Label>
      {@render bioControl()}
    </SettingsBlock>
  {/if}
{/snippet}

{#if mode === 'onboarding'}
  <OnboardingWizard
    steps={STEPS}
    bind:current={step}
    validate={validateStep}
    onExit={onBack}
    onSubmit={save}
    submitLabel="Готово"
    {busy}
    {submitting}
    {busyNote}
    step={stepContent}
  />
{:else}
  <!-- ═══════════════ Форма редагування ═══════════════
       На сторінці налаштувань: заголовок «Профіль» там уже стоїть над
       розділом, а ширину задає сторінка. -->
  <div class="w-full">
    <form
      onsubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      novalidate
    >
      <SettingsGroup
        title="Особисті дані"
        footnote="Ці дані бачить виконавець після підтвердження замовлення."
      >
        <SettingsField
          label="Фото"
          hint="Необов'язково"
          control={photoControl}
        />

        <SettingsField
          label="Ім'я"
          for="name"
          error={nameError}
          control={nameControl}
        />

        <SettingsField
          label="Телефон"
          for="phone"
          hint="Видно виконавцю після підтвердження"
          error={phoneError}
          control={phoneControl}
        />

        <SettingsField label="Місто" error={cityError} control={cityControl} />

        {#if needsDistrict}
          <SettingsField
            label="Район"
            for="district"
            hint="Майстри бачать лише район заявки — точну адресу ви повідомите в чаті"
            error={districtError}
            control={districtControl}
          />
        {/if}

        <SettingsBlock>
          <Label for="bio" class="mb-2 text-sm font-normal">Про себе</Label>
          {@render bioControl()}
        </SettingsBlock>
      </SettingsGroup>

      <!-- ═══ Дії ═══
           У кінці форми, праворуч — як у діалогах macOS. Підтверджувальна
           дія остання: погляд іде зліва направо й закінчується на тому,
           що людина хоче натиснути. -->
      <div class="mt-7 flex items-center justify-end gap-2">
        {#if busyNote}
          <span class="mr-auto text-[12px] text-muted-foreground">
            {busyNote}
          </span>
        {/if}

        <!-- «Скасувати» — рамка кольору primary на прозорому тлі, заливка
             приходить лише під курсором: дві однаково залиті кнопки поруч
             змусили б вибирати очима, яка з них головна. -->
        <Button
          type="button"
          onclick={onBack}
          disabled={busy}
          variant="primary-outline"
        >
          Скасувати
        </Button>

        <!-- Кнопка активна, доки форма не в роботі: заблокована вона не
             каже, ЧОГО бракує. Перевірка спрацьовує на натиск і підписує
             конкретне поле (див. save). -->
        <Button
          type="submit"
          disabled={busy}
          aria-busy={submitting}
          variant="primary"
          class="relative min-w-27.5"
        >
          {#if submitting}
            <Spinner class="animate-spin" aria-hidden="true" />
            <span class="sr-only">Зберігаємо...</span>
          {:else}
            <span>Зберегти</span>
          {/if}
        </Button>
      </div>
    </form>
  </div>
{/if}
