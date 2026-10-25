<!--
  Профіль виконавця — у двох подачах з одним станом:

  • onboarding — покроковий майстер (OnboardingWizard): одне питання на
    екран, від простого до складного — імʼя, фото, послуги, район, як
    далеко їздити, телефон, опис, портфоліо — і в кінці перевірка всього
    разом. Довга
    анкета з восьми полів лякала ще до першого символу;
  • edit — та сама форма одним екраном на сторінці налаштувань.

  Поля описані сніпетами один раз і збираються в обидві подачі, тож
  розійтись між собою вони не можуть. Профіль зберігається ОДНИМ запитом
  у кінці: сервер ставить onboarded лише після повної перевірки, і
  частково заповненого майстра в базі не буває.

  Валідація тут — виключно UX. Авторитет за сервером:
  saveMasterProfile() у $lib/server/profile.ts перевіряє все повторно.
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
  import * as Alert from '$lib/components/ui/alert'
  import * as Avatar from '$lib/components/ui/avatar'
  import AvatarUploader from '$lib/components/avatar-uploader.svelte'
  import UsernameInput from '$lib/components/username-input.svelte'
  import PortfolioUploader from '$lib/components/portfolio-uploader.svelte'
  import FieldError from '$lib/components/forms/field-error.svelte'
  import OnboardingWizard from './onboarding-wizard.svelte'
  import DistrictSelect from './district-select.svelte'
  import TravelRadiusPicker from './travel-radius.svelte'
  import { cityDistricts, findDistrict } from '$lib/geo/districts'
  import {
    isTravelRadius,
    travelLabel,
    type TravelRadius,
  } from '$lib/geo/travel'
  import { cn } from '$lib/utils'
  import toast from 'svelte-hot-french-toast'
  import CheckIcon from '@lucide/svelte/icons/check'
  import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down'
  import { UserRound, Phone, MapPin } from 'lucide-svelte'
  import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
  import CircleAlertIcon from '@lucide/svelte/icons/circle-alert'
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
  const DESC_MIN = 50
  const DESC_MAX = 922
  /** Сервер приймає до 5. Змініть тут, якщо треба інакше. */
  const MAX_CATS = 3

  // Порядок — від того, що людина знає напамʼять, до того, над чим треба
  // подумати: імʼя й фото заповнюються за секунди й дають відчуття руху,
  // опис і портфоліо — наприкінці, коли половина шляху вже позаду.
  const ALL_STEPS: readonly WizardStep[] = [
    {
      id: 'name',
      title: 'Як вас звати?',
      subtitle:
        'Справжнє імʼя — клієнти довіряють людям, а не нікнеймам. Username стане адресою вашої сторінки.',
    },
    {
      id: 'photo',
      title: 'Додайте своє фото',
      subtitle:
        'Майстрів із фото обличчя обирають частіше. Лише ви — без логотипів і картинок.',
      optional: true,
    },
    {
      id: 'services',
      title: 'Що ви робите?',
      subtitle: `Оберіть до ${MAX_CATS} послуг — заявки приходитимуть лише з них.`,
    },
    {
      id: 'city',
      title: 'Де ви живете?',
      subtitle:
        'Заявки з вашого району й сусідніх приходитимуть першими — менше часу в дорозі.',
    },
    {
      id: 'radius',
      title: 'Як далеко готові їздити?',
      subtitle:
        'Далі цієї відстані заявки не надсилатимемо. Чим ширше коло — тим більше заявок.',
    },
    {
      id: 'phone',
      title: 'Ваш номер телефону',
      subtitle:
        'Його побачить лише клієнт, який обрав саме вас, — і лише після підтвердження замовлення.',
    },
    {
      id: 'about',
      title: 'Розкажіть про себе',
      subtitle:
        'Досвід, що берете з собою, чим відрізняєтесь. Це перше, що читає клієнт.',
    },
    {
      id: 'portfolio',
      title: 'Покажіть свою роботу',
      subtitle:
        'Фото «до / після» переконують краще за слова. Можна додати й пізніше.',
      optional: true,
    },
    {
      id: 'review',
      title: 'Усе правильно?',
      subtitle:
        'Так вас бачитимуть клієнти. Після надсилання профіль перевірить модератор.',
    },
  ]

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
  let district = $state(initial.district ?? '')
  // Новий профіль — «будь-де»: звузити коло людина може сама, а з вузьким
  // за замовчуванням вона б і не дізналась, скільки заявок минає її.
  let travelRadius = $state<TravelRadius>(
    mp && isTravelRadius(mp.travelRadiusKm) ? mp.travelRadiusKm : null,
  )

  let categories = $state<string[]>(mp?.categories ?? [])
  let description = $state(mp?.description ?? '')

  let portfolioImages = $state<string[]>(mp?.portfolioImages ?? [])
  let portfolioImagesPublicIds = $state<string[]>(
    mp?.portfolioImagesPublicIds ?? [],
  )
  let portfolioUploading = $state(false)

  let submitting = $state(false)
  let step = $state(0)

  // Помилку показуємо лише після виходу з поля (або спроби піти далі):
  // червоне під порожнім полем, якого ще не торкались, — це грубо.
  let touched = $state({
    name: false,
    username: false,
    phone: false,
    city: false,
    district: false,
    desc: false,
    categories: false,
  })

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
  const cityName = $derived(
    data.cities.find((c) => c.slug === city)?.name ?? '',
  )
  const categoryNames = $derived(
    data.categories
      .filter((c) => categories.includes(c.slug))
      .map((c) => c.name),
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

  // Район і радіус — лише там, де для міста є райони в БД (зараз —
  // Одеса). Без них кроку «як далеко» нема про що питати.
  const districts = $derived(cityDistricts(data.districts, city))
  const needsDistrict = $derived(districts.length > 0)
  const districtValid = $derived(
    !needsDistrict || !!findDistrict(districts, district),
  )
  const districtName = $derived(findDistrict(districts, district)?.name ?? '')
  const districtError = $derived(
    touched.district && !districtValid ? 'Оберіть район' : '',
  )
  const categoriesError = $derived(
    touched.categories && categories.length === 0
      ? 'Оберіть хоча б одну послугу'
      : '',
  )
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
      districtValid &&
      categories.length > 0 &&
      descValid,
  )

  const busy = $derived(submitting || avatarUploading || portfolioUploading)
  const busyNote = $derived(
    avatarUploading || portfolioUploading ? 'Фото ще завантажується...' : '',
  )
  const wasRejected = $derived(mp?.verificationStatus === 'REJECTED')

  // ─── Кроки ───
  const STEPS = $derived(
    needsDistrict ? ALL_STEPS : ALL_STEPS.filter((s) => s.id !== 'radius'),
  )
  const stepIndex = (id: string) => STEPS.findIndex((s) => s.id === id)

  /** Чи заповнений крок — без побічних ефектів, для пошуку першої дірки. */
  function stepOk(id: string): boolean {
    switch (id) {
      case 'name':
        return nameValid && usernameValid === true
      case 'services':
        return categories.length > 0
      case 'city':
        return !!city && districtValid
      case 'phone':
        return phoneValid
      case 'about':
        return descValid
      default:
        return true
    }
  }

  /**
   * Перевірка перед «Далі»: поля кроку стають «торкнутими», тож якщо
   * чогось бракує, підпис під полем зʼявляється саме зараз. На кроці
   * перевірки, якщо щось не так, ведемо на перший незаповнений крок —
   * людина бачить, що саме виправити, а не загальне «перевірте поля».
   */
  function validateStep(id: string): boolean {
    switch (id) {
      case 'name':
        touched.name = true
        touched.username = true
        break
      case 'services':
        touched.categories = true
        break
      case 'city':
        touched.city = true
        touched.district = true
        break
      case 'phone':
        touched.phone = true
        break
      case 'about':
        touched.desc = true
        break
      case 'review': {
        const gap = STEPS.find((s) => !stepOk(s.id))
        if (!gap) return true
        validateStep(gap.id)
        step = stepIndex(gap.id)
        return false
      }
    }
    return stepOk(id)
  }

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

  async function save(): Promise<void> {
    if (busy) return

    touched = {
      name: true,
      username: true,
      phone: true,
      city: true,
      district: true,
      desc: true,
      categories: true,
    }
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
          district: needsDistrict ? district : null,
          travelRadiusKm: travelRadius,
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
        mode === 'edit'
          ? 'Зміни збережено'
          : 'Готово! Профіль надіслано на перевірку',
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

{#snippet photoControl(large: boolean = false)}
  <AvatarUploader
    bind:value={avatarUrl}
    bind:publicId={avatarPublicId}
    bind:uploading={avatarUploading}
    fallback={nameTrim.charAt(0).toUpperCase() || '?'}
    {large}
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

{#snippet usernameControl()}
  <UsernameInput
    bind:value={username}
    bind:isValid={usernameValid}
    bind:touched={touched.username}
    currentUsername={initial.username ?? ''}
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

{#snippet radiusControl()}
  <TravelRadiusPicker {districts} {district} bind:value={travelRadius} />
{/snippet}

{#snippet categoriesControl()}
  <!-- Чіпи замість меню: усі варіанти видно одразу, вибір у клік.
       aria-pressed, а не checkbox — кнопка-перемикач читається
       скрінрідером як «натиснуто / не натиснуто». -->
  <div class="flex flex-wrap gap-2">
    {#each data.categories as c (c.slug)}
      {@const selected = categories.includes(c.slug)}
      <button
        type="button"
        onclick={() => toggleCategory(c.slug)}
        aria-pressed={selected}
        class={cn(
          'inline-flex items-center gap-1.5 rounded-[8px] border px-3.5 py-1.5 text-[13px] transition-colors',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input bg-background text-foreground hover:bg-accent',
        )}
      >
        {#if selected}
          <CheckIcon class="size-3.5" aria-hidden="true" />
        {/if}
        {c.name}
      </button>
    {/each}
  </div>
{/snippet}

{#snippet descriptionControl(rows: number = 5)}
  <Textarea
    id="description"
    bind:value={description}
    onblur={() => (touched.desc = true)}
    placeholder="Досвід, що саме робите, чим відрізняєтесь від інших."
    {rows}
    maxlength={DESC_MAX}
    aria-invalid={!!descError}
    class="resize-none bg-background"
    required
  />
  <!-- Підказка про мінімум зникає, щойно його набрано, а лічильник
       зʼявляється лише біля стелі: обидва потрібні рівно тоді, коли до
       межі близько, і мовчать решту часу. -->
  <div class="mt-1.5 flex items-start justify-between gap-4">
    {#if descError}
      <p
        class="flex items-center gap-1.5 text-[12px] text-destructive"
        role="alert"
      >
        <CircleAlertIcon class="size-3.5 shrink-0" aria-hidden="true" />
        {descError}
      </p>
    {:else if descTrim.length < DESC_MIN}
      <p class="text-[12px] text-muted-foreground">
        Мінімум {DESC_MIN} символів.
      </p>
    {/if}

    {#if descTrim.length > DESC_MAX * 0.8}
      <span
        class="ms-auto shrink-0 text-[12px] tabular-nums text-muted-foreground"
      >
        {descTrim.length}/{DESC_MAX}
      </span>
    {/if}
  </div>
{/snippet}

{#snippet portfolioControl()}
  <PortfolioUploader
    bind:images={portfolioImages}
    bind:publicIds={portfolioImagesPublicIds}
    bind:uploading={portfolioUploading}
    maxItems={6}
    onError={(msg) => toast.error(msg)}
  />
{/snippet}

<!-- ═══════════════ Майстер кроків ═══════════════ -->

<!-- Рядок підсумку на кроці перевірки: що вписано й посилання повернутись. -->
{#snippet reviewRow(label: string, target: string, value: string)}
  <div class="flex items-start gap-4 py-3.5">
    <dt class="w-28 shrink-0 pt-px text-[13px] text-muted-foreground">
      {label}
    </dt>
    <dd class="min-w-0 flex-1 text-[14px] wrap-anywhere">
      {#if value}
        <span class="line-clamp-3">{value}</span>
      {:else}
        <span class="text-muted-foreground">Не додано</span>
      {/if}
    </dd>
    <button
      type="button"
      onclick={() => (step = stepIndex(target))}
      class="shrink-0 cursor-pointer rounded-sm text-[13px] text-primary underline-offset-4 transition-colors hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Змінити
    </button>
  </div>
{/snippet}

{#snippet stepContent(id: string)}
  {#if id === 'name'}
    <SettingsField
      label="Ім'я"
      for="name"
      error={nameError}
      control={nameControl}
    />
    <SettingsField label="Username" for="username" control={usernameControl} />
    <!-- Адреса сторінки — видимим рядком, а не підказкою: на цьому кроці
         людина саме її й придумує, і бачити результат одразу — приємно. -->
    <p class="mt-1 text-[13px] text-muted-foreground">
      Ваша сторінка: zunor.org/@{username || 'username'}
    </p>
  {:else if id === 'photo'}
    <div class="flex justify-center py-4">
      {@render photoControl(true)}
    </div>
  {:else if id === 'services'}
    {@render categoriesControl()}
    <FieldError text={categoriesError} />
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
  {:else if id === 'radius'}
    {@render radiusControl()}
  {:else if id === 'phone'}
    <SettingsField
      label="Телефон"
      for="phone"
      error={phoneError}
      control={phoneControl}
    />
  {:else if id === 'about'}
    <Label for="description" class="sr-only">Про себе</Label>
    {@render descriptionControl(7)}
  {:else if id === 'portfolio'}
    {@render portfolioControl()}
  {:else if id === 'review'}
    {#if wasRejected && mp?.verificationRejectReason}
      <Alert.Root variant="destructive" class="mb-5">
        <AlertCircleIcon class="size-4" />
        <Alert.Title>Профіль не пройшов перевірку</Alert.Title>
        <Alert.Description>{mp.verificationRejectReason}</Alert.Description>
      </Alert.Root>
    {/if}

    <!-- Превʼю «як побачить клієнт» угорі, під ним — рядки з кожного
         кроку. Фінальний погляд перед надсиланням знімає тривогу «а чи
         все я вказав». -->
    <div class="flex items-center gap-4">
      <Avatar.Root class="size-16">
        {#if avatarUrl}
          <Avatar.Image src={avatarUrl} alt="" class="object-cover" />
        {/if}
        <Avatar.Fallback
          class="bg-muted text-xl font-medium text-muted-foreground"
        >
          {nameTrim.charAt(0).toUpperCase() || '?'}
        </Avatar.Fallback>
      </Avatar.Root>
      <div class="min-w-0">
        <p class="truncate text-[17px] font-semibold">{nameTrim}</p>
        <p class="truncate text-[14px] text-muted-foreground">
          @{username}{cityName ? ` · ${cityName}` : ''}
        </p>
      </div>
    </div>

    <dl class="mt-5 divide-y divide-border border-y border-border">
      {@render reviewRow('Імʼя', 'name', `${nameTrim} · @${username}`)}
      {@render reviewRow('Фото', 'photo', avatarUrl ? 'Додано' : '')}
      {@render reviewRow('Послуги', 'services', categoryNames.join(', '))}
      {@render reviewRow(
        'Де живете',
        'city',
        [districtName, cityName].filter(Boolean).join(', '),
      )}
      {#if needsDistrict}
        {@render reviewRow('Виїзд', 'radius', travelLabel(travelRadius))}
      {/if}
      {@render reviewRow('Телефон', 'phone', `+380 ${phoneDisplay}`)}
      {@render reviewRow('Про себе', 'about', descTrim)}
      {@render reviewRow(
        'Приклади робіт',
        'portfolio',
        portfolioImages.length ? `${portfolioImages.length} фото` : '',
      )}
    </dl>
  {/if}
{/snippet}

{#if mode === 'onboarding'}
  <OnboardingWizard
    steps={STEPS}
    bind:current={step}
    validate={validateStep}
    onExit={onBack}
    onSubmit={save}
    submitLabel="Надіслати на перевірку"
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
    {#if wasRejected && mp?.verificationRejectReason}
      <Alert.Root variant="destructive" class="mb-6">
        <AlertCircleIcon class="size-4" />
        <Alert.Title>Профіль не пройшов перевірку</Alert.Title>
        <Alert.Description>{mp.verificationRejectReason}</Alert.Description>
      </Alert.Root>
    {/if}

    <form
      onsubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      novalidate
    >
      <SettingsGroup
        title="Особисті дані"
        footnote="Клієнти бачать ці дані, обираючи виконавця. Зміни підуть на повторну перевірку."
      >
        <SettingsField label="Фото" hint="З фото відгукуються охочіше">
          {#snippet control()}
            {@render photoControl()}
          {/snippet}
        </SettingsField>

        <SettingsField
          label="Ім'я"
          for="name"
          error={nameError}
          control={nameControl}
        />

        <SettingsField
          label="Username"
          for="username"
          hint="Адреса вашого профілю: zunor.org/@{username || 'username'}"
          control={usernameControl}
        />

        <SettingsField
          label="Телефон"
          for="phone"
          hint="Видно клієнту після підтвердження"
          error={phoneError}
          control={phoneControl}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Де ви працюєте"
        footnote="Заявки з вашого району й сусідніх приходять першими. Далі обраної відстані — не надсилаємо."
      >
        <SettingsField label="Місто" error={cityError} control={cityControl} />

        {#if needsDistrict}
          <SettingsField
            label="Район"
            for="district"
            hint="Звідки ви їдете на замовлення. Публічно його не показуємо"
            error={districtError}
            control={districtControl}
          />

          <SettingsBlock>
            <p class="mb-2 text-sm">Як далеко готові їздити</p>
            {@render radiusControl()}
          </SettingsBlock>
        {/if}
      </SettingsGroup>

      <!-- Заголовок картки замінив собою підпис «Що ви виконуєте», який
           стояв першим рядком усередині: два заголовки підряд про одне й
           те саме. Обмеження поїхало у виноску під карткою. -->
      <SettingsGroup
        title="Що ви виконуєте"
        footnote="До {MAX_CATS} категорій. Заявки надходитимуть лише з них."
      >
        <SettingsBlock>
          {@render categoriesControl()}
          <FieldError text={categoriesError} />
        </SettingsBlock>

        <SettingsBlock>
          <Label for="description" class="mb-2 text-sm font-normal">
            Про себе
          </Label>
          {@render descriptionControl()}
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup
        title="Приклади робіт"
        footnote="Необов'язково. Фото «до / після» працюють найкраще."
      >
        <SettingsBlock>
          {@render portfolioControl()}
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
