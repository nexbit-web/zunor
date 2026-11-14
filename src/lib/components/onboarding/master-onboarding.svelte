<!--
  Профіль виконавця — у двох подачах з одним станом:

  • onboarding — покроковий майстер (OnboardingWizard): одне питання на
    екран, від простого до складного — хто ви (людина чи компанія),
    імʼя чи назва, фото чи логотип, телефон, які прибирання, де (житло
    чи офіси), район, авто, як далеко їздити, сам чи з напарником, опис,
    портфоліо — і в кінці перевірка всього разом. Довга анкета з восьми
    полів лякала ще до першого символу;
  • edit — та сама форма одним екраном на сторінці налаштувань.

  «Людина чи компанія» — перше питання, бо від нього залежить решта
  анкети: компанія вписує назву замість імені й логотип замість фото, а
  «сам чи з напарником» її не питаємо — компанія завжди команда. В базі
  це не окреме поле: компанія — MasterProfile.crew = COMPANY, а назва
  лежить у User.name, як імʼя в людини ($lib/masters/meta).

  Питання «які прибирання», «де», «авто» й «формат роботи» — для підбору:
  від них залежить, які заявки до майстра взагалі дійдуть і яким він буде
  в черзі (categories/matching, server/dispatch). Тому вони обовʼязкові.

  Поля описані сніпетами один раз і збираються в обидві подачі, тож
  розійтись між собою вони не можуть. Профіль зберігається ОДНИМ запитом
  у кінці: сервер ставить onboarded лише після повної перевірки, і
  частково заповненого майстра в базі не буває.

  Валідація тут — виключно UX. Авторитет за сервером:
  saveMasterProfile() у $lib/server/profile.ts перевіряє все повторно.
-->
<script lang="ts">
  import { beforeNavigate, goto, invalidateAll } from '$app/navigation'
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
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import * as Avatar from '$lib/components/ui/avatar'
  import AvatarUploader from '$lib/components/avatar-uploader.svelte'
  import UsernameInput from '$lib/components/username-input.svelte'
  import PortfolioUploader from '$lib/components/portfolio-uploader.svelte'
  import FieldError from '$lib/components/forms/field-error.svelte'
  import OnboardingWizard from './onboarding-wizard.svelte'
  import DistrictSelect from './district-select.svelte'
  import TravelRadiusPicker from './travel-radius.svelte'
  import ChoiceTiles from './choice-tiles.svelte'
  import StageArt from './stage-art.svelte'
  import CatScene from '$lib/components/mascot/cat-scene.svelte'
  import { cityDistricts, findDistrict } from '$lib/geo/districts'
  import {
    isTravelRadius,
    travelLabel,
    type TravelRadius,
  } from '$lib/geo/travel'
  import { cn } from '$lib/utils'
  import toast from 'svelte-hot-french-toast'
  import ServiceIcon from '$lib/categories/cleaning/service-icon.svelte'
  import { CATEGORY_SLUG, SERVICES } from '$lib/categories/cleaning/presets'
  import {
    PREMISE_GROUPS,
    SERVICE_HINTS,
    parseCleaningSkills,
    type PremiseGroup,
  } from '$lib/categories/cleaning/skills'
  import {
    KIND_OPTIONS,
    PERSON_CREW_OPTIONS,
    VEHICLE_OPTIONS,
    crewLabel,
    kindLabel,
    kindOfCrew,
    parseMasterSkills,
    vehicleLabel,
    type Crew,
    type MasterKind,
    type PersonCrew,
  } from '$lib/masters/meta'
  import CheckIcon from '$lib/components/icons/set/check.svelte'
  import ChevronsUpDownIcon from '$lib/components/icons/set/chevrons-up-down.svelte'
  import UserRound from '$lib/components/icons/set/user-round.svelte'
  import Phone from '$lib/components/icons/set/phone.svelte'
  import MapPin from '$lib/components/icons/set/map-pin.svelte'
  import Briefcase from '$lib/components/icons/set/briefcase.svelte'
  import Car from '$lib/components/icons/set/car.svelte'
  import Bus from '$lib/components/icons/set/bus.svelte'
  import User from '$lib/components/icons/set/user.svelte'
  import Users from '$lib/components/icons/set/users.svelte'
  import House from '$lib/components/icons/set/house.svelte'
  import Building2 from '$lib/components/icons/set/building-2.svelte'
  import AlertCircleIcon from '$lib/components/icons/set/circle-alert.svelte'
  import CircleAlertIcon from '$lib/components/icons/set/circle-alert.svelte'
  import type {
    OnboardingData,
    WizardPhase,
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

  // Три етапи, як в анкеті господаря на Airbnb: огляд на початку,
  // заставка перед кожним етапом і смуга прогресу по етапах. Дванадцять
  // питань підряд втомлюють; «другий етап із трьох» — ні.
  //
  // Тексти — під відповідь на перше питання: людині «Як вас звати?»,
  // компанії «Як називається компанія?». Поки відповіді немає — як людині.
  function phasesFor(company: boolean): WizardPhase[] {
    return [
      {
        id: 'you',
        title: company ? 'Про компанію' : 'Познайомимось',
        lead: company
          ? 'Назва, логотип і телефон. Клієнти бачать вивіску, а номер — у ваших пропозиціях, щоб подзвонити й домовитись.'
          : 'Імʼя, фото й телефон. Клієнти обирають людей, а не нікнейми, а номер бачать у ваших пропозиціях, щоб подзвонити й домовитись.',
      },
      {
        id: 'work',
        title: 'Яку роботу берете',
        lead: company
          ? 'Які прибирання робите, звідки виїжджаєте й чи є авто. З цього ми підбираємо заявки — лише ті, що вам справді підходять.'
          : 'Які прибирання робите, де живете й як добираєтесь. З цього ми підбираємо заявки — лише ті, що вам справді підходять.',
      },
      {
        id: 'profile',
        title: company
          ? 'Покажіть компанію клієнтам'
          : 'Покажіть себе клієнтам',
        lead: company
          ? 'Кілька слів про команду й фото робіт — і профіль іде на перевірку. Після неї заявки почнуть приходити самі.'
          : 'Кілька слів про досвід і фото робіт — і профіль іде на перевірку. Після неї заявки почнуть приходити самі.',
      },
    ]
  }

  // «Людина чи компанія» стоїть навіть перед оглядом: огляд і заставки
  // вже говорять мовою відповіді. Далі — від того, що людина знає
  // напамʼять, до того, над чим треба подумати: імʼя й фото заповнюються
  // за секунди й дають відчуття руху, опис і портфоліо — наприкінці.
  function stepsFor(company: boolean): WizardStep[] {
    return [
      {
        id: 'who',
        title: 'Ви — приватний майстер чи компанія?',
        subtitle:
          'Від цього залежить, про що спитаємо далі: імʼя чи назву, фото чи логотип.',
      },
      {
        id: 'overview',
        kind: 'overview',
        title: company
          ? 'Підключити компанію до Zunor — просто'
          : 'Стати майстром Zunor — просто',
        subtitle: '',
      },
      { id: 'intro-you', kind: 'intro', phase: 'you', title: '', subtitle: '' },
      company
        ? {
            id: 'name',
            phase: 'you',
            title: 'Як називається компанія?',
            subtitle:
              'Так вас бачитимуть клієнти — у пропозиціях, чаті й відгуках. Username стане адресою сторінки компанії.',
          }
        : {
            id: 'name',
            phase: 'you',
            title: 'Як вас звати?',
            subtitle:
              'Справжнє імʼя — клієнти довіряють людям, а не нікнеймам. Username стане адресою вашої сторінки.',
          },
      company
        ? {
            id: 'photo',
            phase: 'you',
            title: 'Додайте логотип',
            subtitle:
              'Логотип або фото команди — клієнти бачать його поруч із назвою.',
            optional: true,
          }
        : {
            id: 'photo',
            phase: 'you',
            title: 'Додайте своє фото',
            subtitle:
              'Майстрів із фото обличчя обирають частіше. Лише ви — без логотипів і картинок.',
            optional: true,
          },
      {
        id: 'phone',
        phase: 'you',
        title: company ? 'Телефон компанії' : 'Ваш номер телефону',
        subtitle:
          'Клієнт побачить його у вашій пропозиції — щоб подзвонити й домовитись про ціну й деталі.',
      },
      {
        id: 'intro-work',
        kind: 'intro',
        phase: 'work',
        title: '',
        subtitle: '',
      },
      {
        id: 'services',
        phase: 'work',
        title: 'Які прибирання ви робите?',
        subtitle:
          'Заявки приходитимуть лише з обраних — без того, чим ви не займаєтесь.',
      },
      {
        id: 'premises',
        phase: 'work',
        title: 'Де готові прибирати?',
        subtitle:
          'Офісні заявки не надсилатимемо тим, хто прибирає лише житло, — і навпаки.',
      },
      company
        ? {
            id: 'city',
            phase: 'work',
            title: 'Звідки виїжджаєте на замовлення?',
            subtitle:
              'Район офісу чи складу. Заявки з нього й сусідніх приходитимуть першими — менше часу в дорозі.',
          }
        : {
            id: 'city',
            phase: 'work',
            title: 'Де ви живете?',
            subtitle:
              'Заявки з вашого району й сусідніх приходитимуть першими — менше часу в дорозі.',
          },
      {
        id: 'transport',
        phase: 'work',
        title: company
          ? 'Як команда добирається на замовлення?'
          : 'Як добираєтесь на замовлення?',
        subtitle: 'Підбираємо заявки так, щоб дорога не зʼїдала ваш день.',
      },
      {
        id: 'radius',
        phase: 'work',
        title: 'Як далеко готові їздити?',
        subtitle:
          'Далі цієї відстані заявки не надсилатимемо. Чим ширше коло — тим більше заявок.',
      },
      // Лише людині: компанія — завжди команда (див. STEPS).
      {
        id: 'crew',
        phase: 'work',
        title: 'Працюєте самі чи з напарником?',
        subtitle:
          'Невеликі заявки першими отримують ті, хто працює сам, а великі квартири, будинки й після ремонту — ті, хто з напарником чи бригадою.',
      },
      {
        id: 'intro-profile',
        kind: 'intro',
        phase: 'profile',
        title: '',
        subtitle: '',
      },
      company
        ? {
            id: 'about',
            phase: 'profile',
            title: 'Розкажіть про компанію',
            subtitle:
              'Скільки людей у команді, як давно працюєте, чим відрізняєтесь. Це перше, що читає клієнт.',
          }
        : {
            id: 'about',
            phase: 'profile',
            title: 'Розкажіть про себе',
            subtitle:
              'Досвід, що берете з собою, чим відрізняєтесь. Це перше, що читає клієнт.',
          },
      {
        id: 'portfolio',
        phase: 'profile',
        title: 'Покажіть свою роботу',
        subtitle:
          'Фото «до / після» переконують краще за слова. Можна додати й пізніше.',
        optional: true,
      },
      {
        id: 'review',
        phase: 'profile',
        title: 'Усе правильно?',
        subtitle:
          'Так вас бачитимуть клієнти. Після надсилання профіль перевірить модератор.',
      },
    ]
  }

  // untrack: початкові значення беремо один раз, інакше оновлення data
  // затирало б те, що людина щойно набрала.
  const initial = untrack(() => data.user)
  const mp = initial.masterProfile

  // ─── Хто ви ───
  // Людина чи компанія — з формату роботи: компанія — це crew = COMPANY.
  const savedCrew = mp?.crew ?? null
  const savedWho = kindOfCrew(savedCrew)
  let who = $state<MasterKind | null>(savedWho)
  let personCrew = $state<PersonCrew | null>(
    savedCrew === 'COMPANY' ? null : savedCrew,
  )
  const isCompany = $derived(who === 'company')
  const crew = $derived<Crew | null>(
    isCompany ? 'COMPANY' : who === 'person' ? personCrew : null,
  )

  const PHASES = $derived(phasesFor(isCompany))

  // ─── Поля ───
  let avatarUrl = $state(initial.avatar ?? '')
  let avatarPublicId = $state(initial.avatarPublicId ?? '')
  let avatarUploading = $state(false)

  // Імʼя людини й назва компанії — обидва User.name, але чернетки окремі:
  // інакше імʼя з Google-акаунта ставало б «назвою компанії», а
  // перемикання туди й назад стирало б набране.
  let personName = $state(savedWho === 'company' ? '' : (initial.name ?? ''))
  let companyTitle = $state(savedWho === 'company' ? (initial.name ?? '') : '')
  const name = $derived(isCompany ? companyTitle : personName)
  function setName(v: string): void {
    if (isCompany) companyTitle = v
    else personName = v
  }
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

  // Категорія поки одна — «Прибирання», і чіп з одним варіантом був би
  // питанням без вибору. Її обираємо самі, а питаємо те, що в ній
  // справді різниться: які саме прибирання.
  const onlyCategory = untrack(() =>
    data.categories.length === 1 ? data.categories[0].slug : null,
  )
  let categories = $state<string[]>(
    mp?.categories?.length ? mp.categories : onlyCategory ? [onlyCategory] : [],
  )
  let description = $state(mp?.description ?? '')

  // ─── Відповіді для підбору ───
  const savedSkills = parseCleaningSkills(
    parseMasterSkills(mp?.metadata)[CATEGORY_SLUG],
  )
  let services = $state<string[]>(savedSkills?.services ?? [])
  let premises = $state<PremiseGroup[]>(savedSkills?.premises ?? [])
  let vehicle = $state<boolean | null>(mp?.hasVehicle ?? null)

  let portfolioImages = $state<string[]>(mp?.portfolioImages ?? [])
  let portfolioImagesPublicIds = $state<string[]>(
    mp?.portfolioImagesPublicIds ?? [],
  )
  let portfolioUploading = $state(false)

  // ─── Незбережені фото робіт ───
  // Нове фото одразу летить у хмару й видно в сітці, але в профіль
  // потрапляє лише з «Зберегти» (і йде на перевірку). Тому в редагуванні
  // позначаємо нові, а вихід зі сторінки з ними — питаємо, а не мовчки
  // губимо. В онбордингу незбережене все, і позначки там нічого не кажуть.
  const savedPortfolioIds = mp?.portfolioImagesPublicIds ?? []
  const unsavedPhotos = $derived(
    mode === 'edit'
      ? portfolioImagesPublicIds.filter((id) => !savedPortfolioIds.includes(id))
      : [],
  )
  /** Куди людина йшла, коли ми її зупинили питанням. */
  let leaveTo = $state<string | null>(null)
  const leaveText = $derived(
    unsavedPhotos.length === 1
      ? 'Ви додали фото до прикладів робіт, але не зберегли його. Без збереження воно не потрапить у профіль.'
      : 'Ви додали фото до прикладів робіт, але не зберегли їх. Без збереження вони не потраплять у профіль.',
  )
  let discarding = false

  let submitting = $state(false)
  let step = $state(0)

  // Помилку показуємо лише після виходу з поля (або спроби піти далі):
  // червоне під порожнім полем, якого ще не торкались, — це грубо.
  let touched = $state({
    who: false,
    name: false,
    username: false,
    phone: false,
    city: false,
    district: false,
    desc: false,
    categories: false,
    services: false,
    premises: false,
    vehicle: false,
    crew: false,
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

  const whoError = $derived(
    touched.who && who === null ? 'Оберіть один із варіантів' : '',
  )
  const nameLabel = $derived(isCompany ? 'Назва' : "Ім'я")
  const nameError = $derived(
    touched.name && !nameValid
      ? nameTrim.length === 0
        ? isCompany
          ? 'Введіть назву компанії'
          : "Введіть ім'я"
        : `${nameLabel}: ${NAME_MIN}–${NAME_MAX} символів`
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

  /** Прибирання серед категорій — тоді питаємо, які саме й де. */
  const cleans = $derived(categories.includes(CATEGORY_SLUG))
  const servicesError = $derived(
    touched.services && cleans && services.length === 0
      ? 'Оберіть хоча б один вид прибирання'
      : '',
  )
  const premisesError = $derived(
    touched.premises && cleans && premises.length === 0
      ? 'Оберіть хоча б один варіант'
      : '',
  )
  const vehicleError = $derived(
    touched.vehicle && vehicle === null ? 'Оберіть один із варіантів' : '',
  )
  const crewError = $derived(
    touched.crew && personCrew === null ? 'Оберіть один із варіантів' : '',
  )
  const serviceNames = $derived(
    SERVICES.filter((s) => services.includes(s.key)).map((s) => s.label),
  )
  const premiseNames = $derived(
    PREMISE_GROUPS.filter((g) => premises.includes(g.key)).map((g) => g.label),
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
      (!cleans || (services.length > 0 && premises.length > 0)) &&
      vehicle !== null &&
      // null, доки немає відповіді «хто ви», а в людини — ще й «сам чи з
      // напарником».
      crew !== null &&
      descValid,
  )

  const busy = $derived(submitting || avatarUploading || portfolioUploading)
  const busyNote = $derived(
    avatarUploading || portfolioUploading ? 'Фото ще завантажується...' : '',
  )
  const wasRejected = $derived(mp?.verificationStatus === 'REJECTED')

  // ─── Кроки ───
  const STEPS = $derived(
    stepsFor(isCompany).filter(
      (s) =>
        (needsDistrict || s.id !== 'radius') &&
        (cleans || s.id !== 'premises') &&
        (!isCompany || s.id !== 'crew'),
    ),
  )
  const stepIndex = (id: string) => STEPS.findIndex((s) => s.id === id)

  /** Чи заповнений крок — без побічних ефектів, для пошуку першої дірки. */
  function stepOk(id: string): boolean {
    switch (id) {
      case 'who':
        return who !== null
      case 'name':
        return nameValid && usernameValid === true
      case 'services':
        return categories.length > 0 && (!cleans || services.length > 0)
      case 'premises':
        return !cleans || premises.length > 0
      case 'transport':
        return vehicle !== null
      case 'crew':
        return personCrew !== null
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
      case 'who':
        touched.who = true
        break
      case 'name':
        touched.name = true
        touched.username = true
        break
      case 'services':
        touched.categories = true
        touched.services = true
        break
      case 'premises':
        touched.premises = true
        break
      case 'transport':
        touched.vehicle = true
        break
      case 'crew':
        touched.crew = true
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

  const SERVICE_OPTIONS = SERVICES.map((s) => ({
    value: s.key as string,
    label: s.label,
    hint: SERVICE_HINTS[s.key],
  }))
  const PREMISE_ICONS = { home: House, business: Building2 }
  const PREMISE_OPTIONS = PREMISE_GROUPS.map((g) => ({
    value: g.key as PremiseGroup,
    label: g.label,
    hint: g.hint,
    icon: PREMISE_ICONS[g.key],
  }))
  const TRANSPORT_OPTIONS = VEHICLE_OPTIONS.map((o) => ({
    ...o,
    icon: o.value ? Car : Bus,
  }))
  const WHO_ICONS = { person: User, company: Building2 }
  const WHO_TILES = KIND_OPTIONS.map((o) => ({
    ...o,
    icon: WHO_ICONS[o.value],
  }))
  const CREW_ICONS = { SOLO: User, TEAM: Users }
  const CREW_TILES = PERSON_CREW_OPTIONS.map((o) => ({
    ...o,
    icon: CREW_ICONS[o.value],
  }))

  const allServices = $derived(services.length === SERVICES.length)

  /** Універсалів більшість — «Обрати всі» замість шести кліків. */
  function toggleAllServices(): void {
    services = allServices ? [] : SERVICES.map((s) => s.key)
    touched.services = true
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

  async function save(next = '/dashboard'): Promise<void> {
    if (busy) return

    touched = {
      who: true,
      name: true,
      username: true,
      phone: true,
      city: true,
      district: true,
      desc: true,
      categories: true,
      services: true,
      premises: true,
      vehicle: true,
      crew: true,
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
          vehicle,
          crew,
          skills: cleans ? { [CATEGORY_SLUG]: { services, premises } } : {},
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
      await goto(next)
    } catch {
      toast.error("Помилка з'єднання. Перевірте інтернет.")
    } finally {
      submitting = false
    }
  }

  // Збереження саме веде на іншу сторінку (submitting ще true) — його не
  // зупиняємо. Закриття вкладки чи чужий сайт: свого вікна там не
  // показати, cancel() просить браузер спитати своїм.
  beforeNavigate(({ cancel, to, willUnload }) => {
    if (discarding || submitting || unsavedPhotos.length === 0) return
    cancel()
    if (willUnload || !to) return
    leaveTo = to.url.pathname + to.url.search + to.url.hash
  })

  function saveAndLeave(): void {
    const next = leaveTo ?? '/dashboard'
    leaveTo = null
    void save(next)
  }

  // Вийти без збереження: файли, що так і не потрапили в профіль, із
  // хмари прибираємо — інакше там лишались би фото, яких ніде немає.
  // keepalive — запит доживе, навіть коли сторінка вже пішла.
  function discardAndLeave(): void {
    const next = leaveTo ?? '/dashboard'
    leaveTo = null
    for (const publicId of unsavedPhotos) {
      void fetch('/api/user/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'portfolio-remove', publicId }),
        keepalive: true,
      }).catch(() => {})
    }
    discarding = true
    void goto(next)
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
    {large}
    onError={(msg) => toast.error(msg)}
  />
{/snippet}

{#snippet nameControl()}
  <Input
    id="name"
    icon={isCompany ? Briefcase : UserRound}
    bind:value={() => name, setName}
    onblur={() => (touched.name = true)}
    placeholder={isCompany ? 'Чисто Сервіс' : 'Олена Коваленко'}
    maxlength={NAME_MAX}
    autocomplete={isCompany ? 'organization' : 'name'}
    aria-invalid={!!nameError}
    required
  />
{/snippet}

{#snippet whoControl()}
  <ChoiceTiles
    name="who"
    label="Приватний майстер чи компанія"
    bind:value={who}
    options={WHO_TILES}
    invalid={!!whoError}
    onpick={() => (touched.who = true)}
  />
  <FieldError text={whoError} />
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
          class="w-full cursor-pointer justify-between rounded-[10px] border-input bg-field pl-3 font-normal hover:bg-field aria-expanded:bg-background focus-visible:border-input focus-visible:ring-0 aria-invalid:ring-0 dark:bg-field dark:hover:bg-field dark:aria-expanded:bg-background"
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

{#snippet serviceTileIcon(key: string)}
  <ServiceIcon service={key} class="size-6" />
{/snippet}

<!-- Заставка етапу — рудий кіт-талісман із хмаринкою, як у мобільному
     застосунку (власник): вітається, думає, яку роботу обрати, показує
     свій профіль на планшеті. Мініатюри в огляді етапів лишились
     шматочками інтерфейсу (StageArt): кіт у 72px не читається. -->
{#snippet stageArt(id: string, size: 'lg' | 'sm')}
  {#if size === 'sm'}
    <StageArt kind={id} {size} company={isCompany} />
  {:else if id === 'you'}
    <CatScene scene="hello" say="Познайомимось!" />
  {:else if id === 'work'}
    <CatScene scene="think" say="Яку роботу обрати?" />
  {:else}
    <CatScene
      scene="show"
      say={isCompany ? 'Покажіть компанію!' : 'Покажіть себе!'}
    />
  {/if}
{/snippet}

{#snippet servicesControl()}
  <div class="mb-3 flex items-center justify-between gap-3">
    <span class="text-[13px] text-muted-foreground">
      {services.length > 0
        ? `Обрано ${services.length} з ${SERVICES.length}`
        : 'Можна обрати кілька'}
    </span>
    <button
      type="button"
      onclick={toggleAllServices}
      class="cursor-pointer rounded-sm text-[13px] font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {allServices ? 'Зняти всі' : 'Обрати всі'}
    </button>
  </div>
  <ChoiceTiles
    name="services"
    label="Які прибирання ви робите"
    multiple
    bind:values={services}
    options={SERVICE_OPTIONS}
    iconFor={serviceTileIcon}
    invalid={!!servicesError}
    onpick={() => (touched.services = true)}
  />
  <FieldError text={servicesError} />
{/snippet}

{#snippet premisesControl()}
  <ChoiceTiles
    name="premises"
    label="Де готові прибирати"
    multiple
    bind:values={premises}
    options={PREMISE_OPTIONS}
    invalid={!!premisesError}
    onpick={() => (touched.premises = true)}
  />
  <FieldError text={premisesError} />
{/snippet}

{#snippet transportControl()}
  <ChoiceTiles
    name="vehicle"
    label="Як добираєтесь на замовлення"
    bind:value={vehicle}
    options={TRANSPORT_OPTIONS}
    invalid={!!vehicleError}
    onpick={() => (touched.vehicle = true)}
  />
  <FieldError text={vehicleError} />
{/snippet}

{#snippet crewControl()}
  <ChoiceTiles
    name="crew"
    label="Працюєте самі чи з напарником"
    bind:value={personCrew}
    options={CREW_TILES}
    invalid={!!crewError}
    onpick={() => (touched.crew = true)}
  />
  <FieldError text={crewError} />
{/snippet}

{#snippet descriptionControl(rows: number = 5)}
  <Textarea
    id="description"
    bind:value={description}
    onblur={() => (touched.desc = true)}
    placeholder={isCompany
      ? 'Скільки вас у команді, як давно працюєте, чим відрізняєтесь від інших.'
      : 'Досвід, що саме робите, чим відрізняєтесь від інших.'}
    {rows}
    maxlength={DESC_MAX}
    aria-invalid={!!descError}
    class="resize-none"
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
    savedIds={mode === 'edit' ? savedPortfolioIds : undefined}
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
  {#if id === 'who'}
    {@render whoControl()}
  {:else if id === 'name'}
    <SettingsField
      label={nameLabel}
      for="name"
      error={nameError}
      control={nameControl}
    />
    <SettingsField label="Username" for="username" control={usernameControl} />
    <!-- Адреса сторінки — видимим рядком, а не підказкою: на цьому кроці
         людина саме її й придумує, і бачити результат одразу — приємно. -->
    <p class="mt-1 text-[13px] text-muted-foreground">
      {isCompany ? 'Сторінка компанії' : 'Ваша сторінка'}: zunor.org/@{username ||
        'username'}
    </p>
  {:else if id === 'photo'}
    <div class="flex justify-center py-4">
      {@render photoControl(true)}
    </div>
  {:else if id === 'services'}
    {#if !onlyCategory}
      {@render categoriesControl()}
      <FieldError text={categoriesError} />
    {/if}
    {#if cleans}
      <div class={onlyCategory ? '' : 'mt-6'}>{@render servicesControl()}</div>
    {/if}
  {:else if id === 'premises'}
    {@render premisesControl()}
  {:else if id === 'transport'}
    {@render transportControl()}
  {:else if id === 'crew'}
    {@render crewControl()}
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
    <Label for="description" class="sr-only">
      {isCompany ? 'Про компанію' : 'Про себе'}
    </Label>
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
      {@render reviewRow('Хто ви', 'who', kindLabel(who))}
      {@render reviewRow(
        isCompany ? 'Назва' : 'Імʼя',
        'name',
        `${nameTrim} · @${username}`,
      )}
      {@render reviewRow(
        isCompany ? 'Логотип' : 'Фото',
        'photo',
        avatarUrl ? 'Додано' : '',
      )}
      {@render reviewRow(
        'Послуги',
        'services',
        (cleans ? serviceNames : categoryNames).join(', '),
      )}
      {#if cleans}
        {@render reviewRow(
          'Де прибираєте',
          'premises',
          premiseNames.join(', '),
        )}
      {/if}
      {@render reviewRow(
        isCompany ? 'Звідки виїжджаєте' : 'Де живете',
        'city',
        [districtName, cityName].filter(Boolean).join(', '),
      )}
      {@render reviewRow('Дорога', 'transport', vehicleLabel(vehicle))}
      {#if needsDistrict}
        {@render reviewRow('Виїзд', 'radius', travelLabel(travelRadius))}
      {/if}
      {#if !isCompany}
        {@render reviewRow('Як працюєте', 'crew', crewLabel(personCrew))}
      {/if}
      {@render reviewRow('Телефон', 'phone', `+380 ${phoneDisplay}`)}
      {@render reviewRow(
        isCompany ? 'Про компанію' : 'Про себе',
        'about',
        descTrim,
      )}
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
    phases={PHASES}
    art={stageArt}
    helpHref="/master/about"
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
        title={isCompany ? 'Дані компанії' : 'Особисті дані'}
        footnote="Ці дані бачать клієнти. Зміни пройдуть повторну перевірку."
      >
        <SettingsBlock>
          <p class="mb-3 text-[15px] font-medium">Хто ви</p>
          {@render whoControl()}
        </SettingsBlock>

        <SettingsField
          label={isCompany ? 'Логотип' : 'Фото'}
          hint={isCompany
            ? 'Логотип або фото команди'
            : 'З фото обирають охочіше'}
        >
          {#snippet control()}
            {@render photoControl()}
          {/snippet}
        </SettingsField>

        <SettingsField
          label={nameLabel}
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
          hint="Клієнт бачить його у ваших пропозиціях"
          error={phoneError}
          control={phoneControl}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Де ви працюєте"
        footnote="Заявки далі обраної відстані не надсилаємо."
      >
        <SettingsField label="Місто" error={cityError} control={cityControl} />

        {#if needsDistrict}
          <SettingsField
            label="Район"
            for="district"
            hint="Звідки ви їдете. Публічно не показуємо"
            error={districtError}
            control={districtControl}
          />

          <SettingsBlock>
            <p class="mb-3 text-[15px] font-medium">Як далеко готові їздити</p>
            {@render radiusControl()}
          </SettingsBlock>
        {/if}

        <SettingsBlock>
          <p class="mb-3 text-[15px] font-medium">Як добираєтесь на замовлення</p>
          {@render transportControl()}
        </SettingsBlock>

        {#if !isCompany}
          <SettingsBlock>
            <p class="mb-3 text-[15px] font-medium">Працюєте самі чи з напарником</p>
            {@render crewControl()}
          </SettingsBlock>
        {/if}
      </SettingsGroup>

      <!-- Заголовок картки замінив собою підпис «Що ви виконуєте», який
           стояв першим рядком усередині: два заголовки підряд про одне й
           те саме. Обмеження поїхало у виноску під карткою. -->
      <SettingsGroup
        title="Що ви виконуєте"
        footnote="Надсилатимемо лише такі заявки."
      >
        {#if !onlyCategory}
          <SettingsBlock>
            {@render categoriesControl()}
            <FieldError text={categoriesError} />
          </SettingsBlock>
        {/if}

        {#if cleans}
          <SettingsBlock>
            <p class="mb-3 text-[15px] font-medium">Які прибирання робите</p>
            {@render servicesControl()}
          </SettingsBlock>

          <SettingsBlock>
            <p class="mb-3 text-[15px] font-medium">Де готові прибирати</p>
            {@render premisesControl()}
          </SettingsBlock>
        {/if}

        <SettingsField
          label={isCompany ? 'Про компанію' : 'Про себе'}
          for="description"
          control={descriptionControl}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Приклади робіт"
        footnote="Необовʼязково. Найкраще — фото «до / після»."
      >
        <SettingsBlock>
          {@render portfolioControl()}
        </SettingsBlock>
      </SettingsGroup>

      <!-- ═══ Дії ═══
           Під полями ліворуч, як у формах налаштувань GitHub: праворуч від
           полів шириною 440px кнопки висіли б окремо від форми.
           Підтверджувальна дія остання: погляд іде зліва направо й
           закінчується на тому, що людина хоче натиснути. -->
      <div class="mt-7 flex flex-wrap items-center gap-2">

        <!-- «Скасувати» — сіра капсула, «Зберегти» — синя, як «New
             folder» / «New project» у Lovable: синя одна, тож головну дію
             видно одразу. -->
        <Button
          type="button"
          onclick={onBack}
          disabled={busy}
          variant="secondary"
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

        {#if busyNote}
          <span class="ml-1 text-[12px] text-muted-foreground">
            {busyNote}
          </span>
        {/if}
      </div>
    </form>
  </div>
{/if}

<AlertDialog.Root
  open={leaveTo !== null}
  onOpenChange={(open) => {
    if (!open) leaveTo = null
  }}
>
  <!-- Трохи ширше за типове: на компʼютері три дії стають в один ряд. -->
  <AlertDialog.Content class="data-[size=default]:sm:max-w-md">
    <AlertDialog.Header>
      <AlertDialog.Title>Зберегти нові фото?</AlertDialog.Title>
      <!-- Текст упритул до тегів: опис тримає переноси й пробіли
           (whitespace-pre-wrap), і розбитий по рядках шаблон показувався
           з розривом і відступом посеред речення. -->
      <AlertDialog.Description>{leaveText}</AlertDialog.Description>
    </AlertDialog.Header>
    <!-- На вузькому екрані три дії в ряд не влазять — тоді стовпчиком
         праворуч, головна («Зберегти») згори. Слова всередині кнопки не
         переносяться ніколи. -->
    <AlertDialog.Footer
      class="flex-col-reverse items-end gap-1 sm:flex-row sm:items-center sm:gap-2"
    >
      <AlertDialog.Cancel class="whitespace-nowrap">Скасувати</AlertDialog.Cancel>
      <AlertDialog.Action
        variant="destructive"
        onclick={discardAndLeave}
        class="whitespace-nowrap"
      >
        Не зберігати
      </AlertDialog.Action>
      <AlertDialog.Action onclick={saveAndLeave} class="whitespace-nowrap">
        Зберегти
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
