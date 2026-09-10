<!--
  /master/about — публічний лендінг для майстрів.

  Структура взята з рекрутингових лендінгів клінінгових компаній
  (герой із обіцянкою → чому ми → що це за робота → скільки і коли →
  як почати → що всередині → кого шукаємо → FAQ → CTA). Порядок блоків
  там вивірений на конверсію: спершу «що я з цього матиму», і лише
  потім «що від мене треба».

  Подача — за правилами Apple:

    • перший екран рівно на висоту вікна: один меседж, одна дія;
    • центрована композиція, величезний заголовок зі щільним трекінгом
      (-0.045em) і text-balance;
    • ОДИН фон на всю сторінку. Секції не фарбуються по черзі — інакше
      сторінка читається як склейка з різних лендінгів. Відрізняються
      лише блоки всередині: картка має власну поверхню, фон — ні;
    • іконки без плашок: просто гліф акцентним кольором, великий;
    • багато повітря по вертикалі (py до 132px на десктопі);
    • елементи виїжджають при скролі — плавно, один раз, знизу вгору.

  ⚠️ Зміст під нас, а не скопійований у референсу. Ті лендінги — це
  наймач: у них є ставка, інвентар, навчання, житло, співбесіда й
  бригадир. У нас нічого з цього НЕМАЄ і не має з'явитись у текстах:

    • жодних «36 000–50 000 грн/міс» — ми не роботодавець і зарплату не
      платимо. Ціну називає сам майстер у відгуку;
    • жодного інвентарю, навчання, житла й оплати проїзду;
    • жодної співбесіди й відділу кадрів — реєстрація самостійна,
      перевірка анкети ручна;
    • жодних вигаданих цифр («500 майстрів») — сервіс на старті, і FAQ
      каже про це прямо.

  Тон: продаємо можливість, а не виправдовуємось. Формулювання на
  кшталт «ми не наймаємо й не платимо ставку» на першому екрані
  відлякують — те саме говориться нижче, у блоці «Скільки і коли», де
  людина вже зацікавлена й читає уважно.

  Усе, що тут обіцяно, або вже працює в коді (стрічка заявок, чат,
  профіль-візитка, аналітика, скоринг із бустом новачкам і
  анти-перевантаженням), або є свідомим продуктовим рішенням із
  MANIFESTO.md.
-->
<script lang="ts">
  // Точкові імпорти, а не barrel 'lucide-svelte': бочка реекспортує
  // ~1700 .svelte-іконок і поїхала б у чанк цієї сторінки цілком.
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import BadgeCheck from '@lucide/svelte/icons/badge-check'
  import Bell from '@lucide/svelte/icons/bell'
  import Building2 from '@lucide/svelte/icons/building-2'
  import CalendarClock from '@lucide/svelte/icons/calendar-clock'
  import Camera from '@lucide/svelte/icons/camera'
  import Check from '@lucide/svelte/icons/check'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import Eye from '@lucide/svelte/icons/eye'
  import GraduationCap from '@lucide/svelte/icons/graduation-cap'
  import House from '@lucide/svelte/icons/house'
  import IdCard from '@lucide/svelte/icons/id-card'
  import Inbox from '@lucide/svelte/icons/inbox'
  import MapPin from '@lucide/svelte/icons/map-pin'
  import MessageCircle from '@lucide/svelte/icons/message-circle'
  import ShieldCheck from '@lucide/svelte/icons/shield-check'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import Tag from '@lucide/svelte/icons/tag'
  import TrendingUp from '@lucide/svelte/icons/trending-up'
  import UserPlus from '@lucide/svelte/icons/user-plus'
  import Users from '@lucide/svelte/icons/users'
  import * as Accordion from '$lib/components/ui/accordion/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { reveal } from '$lib/utils/reveal'

  // Тип спільний для всіх карткових списків сторінки: іконка + заголовок
  // + текст. Секції відрізняються лише сіткою, не формою даних.
  interface Item {
    icon: typeof Check
    title: string
    text: string
  }

  // ─── Смуга під героєм ───
  // Замість чужих «36 000 грн/міс» — умови роботи. Вік стоїть тут же:
  // це перше, що перевіряє людина, перш ніж читати далі.
  const FACTS: readonly [string, string][] = [
    ['Ваша ціна', 'Вартість у кожному відгуку називаєте ви'],
    ['Ваш графік', 'Без змін і обовʼязкових годин'],
    ['Заявки самі', 'Клієнтів шукати не треба'],
    ['З 18 років', 'Досвід і документи про освіту не потрібні'],
  ]

  // ─── Чому Zunor ───
  // Вісім карток, і кожна — про механіку, яка вже працює в коді.
  // Порядок від найсильнішого аргументу до найтоншого.
  const BENEFITS: readonly Item[] = [
    {
      icon: Tag,
      title: 'Ціну називаєте ви',
      text: 'Не платформа й не клієнт. У кожному відгуку ви вказуєте свою вартість — і клієнт бачить її поруч з іншими пропозиціями.',
    },
    {
      icon: CalendarClock,
      title: 'Вільний графік',
      text: 'Жодних змін і обовʼязкових годин. Берете тільки ті замовлення, які підходять вам за часом.',
    },
    {
      icon: Inbox,
      title: 'Клієнти приходять самі',
      text: 'Не треба давати рекламу, вести сторінку чи домовлятися з посередниками. Заявка прилітає у стрічку сама.',
    },
    {
      icon: MapPin,
      title: 'Замовлення поруч',
      text: 'Ми враховуємо місто й район: менше часу на дорогу — більше замовлень за той самий день.',
    },
    {
      icon: Sparkles,
      title: 'Новачку — гарантоване місце',
      text: 'Перші замовлення отримують і ті, у кого ще немає жодного відгуку: у видачі клієнту завжди є слот для новачка.',
    },
    {
      icon: ShieldCheck,
      title: 'Захист від перевантаження',
      text: 'Коли у вас три активні замовлення, нових пропозицій стає менше. Ми не завалюємо роботою тих, хто й так зайнятий.',
    },
    {
      icon: IdCard,
      title: 'Профіль-візитка',
      text: 'Власна сторінка з фото, описом, портфоліо й відгуками. Посилання на неї можна давати клієнтам і поза Zunor.',
    },
    {
      icon: TrendingUp,
      title: 'Видно свої цифри',
      text: 'Скільки заявок надійшло, скільки відгуків ви надіслали, скільки замовлень виконали — усе у вкладці «Аналітика».',
    },
  ]

  // ─── Що це за робота ───
  const WORK_TYPES: readonly Item[] = [
    {
      icon: House,
      title: 'Квартири й будинки',
      text: 'Найбільша частина заявок. Звичайне прибирання, генеральне, після ремонту, миття вікон, хімчистка мʼяких меблів.',
    },
    {
      icon: Building2,
      title: 'Офіси та комерція',
      text: 'Разові прибирання й регулярні виїзди за домовленим графіком — зручний варіант, якщо шукаєте стабільне навантаження.',
    },
  ]

  const CLEANING_KINDS = [
    'Звичайне',
    'Генеральне',
    'Після ремонту',
    'Миття вікон',
    'Хімчистка меблів',
    'Регулярне для офісів',
  ] as const

  // ─── Скільки і коли ───
  // Референс ставить тут таблицю «грн/день». Ми поставити таку не
  // можемо: ставки в системі немає взагалі, ціну щоразу називає сам
  // майстер. Тому замість цифр — механіка грошей і формати навантаження.
  const PAYMENT_STEPS = [
    'Клієнт описує завдання — заявка приходить вам у стрічку',
    'Ви надсилаєте відгук зі своєю ціною та зручним часом',
    'Клієнт порівнює пропозиції й обирає — далі спілкуєтесь у чаті',
    'Розрахунок напряму з клієнтом за фактом виконаної роботи',
  ] as const

  const FORMATS: readonly Item[] = [
    {
      icon: CalendarClock,
      title: 'Час від часу',
      text: 'Одне-два замовлення на тиждень, коли є вільний день. Попереджати нікого не треба — просто не відгукуєтесь.',
    },
    {
      icon: Users,
      title: 'Як основна робота',
      text: 'Відгукуєтесь на все, що підходить, і набираєте стільки замовлень, скільки встигаєте якісно виконати.',
    },
    {
      icon: Building2,
      title: 'Регулярні виїзди',
      text: 'Домовляєтесь із клієнтом про постійний графік прямо в чаті — і маєте передбачуване навантаження щотижня.',
    },
  ]

  // ─── Як почати ───
  const STEPS: readonly Item[] = [
    {
      icon: UserPlus,
      title: 'Реєстрація',
      text: 'Пошта, пароль і код підтвердження. Кілька хвилин, ніяких документів на цьому кроці.',
    },
    {
      icon: Camera,
      title: 'Профіль і фото',
      text: 'Справжнє фото обличчя, імʼя, місто й кілька слів про себе. Клієнт обирає людину, а не анкету.',
    },
    {
      icon: BadgeCheck,
      title: 'Перевірка',
      text: 'Ми дивимось кожну анкету вручну. Верифікація — не пропуск на вхід, а перевага: вона піднімає вас у видачі.',
    },
    {
      icon: Bell,
      title: 'Перші заявки',
      text: 'Щойно профіль готовий, заявки з вашого міста починають приходити у стрічку та у сповіщення.',
    },
  ]

  // ─── Що всередині (з ілюстраціями) ───
  const FEED_POINTS = [
    'Стрічка доступних заявок у реальному часі',
    'Тип прибирання, район і час — одразу в картці',
    'Сповіщення про нову заявку, поки ви зайняті іншим',
  ] as const

  const ORDER_POINTS = [
    'Власна вартість і зручний час у кожному відгуку',
    'Чат із клієнтом усередині сервісу',
    'Статус замовлення й історія — в одному місці',
  ] as const

  // ─── Кого шукаємо ───
  const WHO: readonly Item[] = [
    {
      icon: ShieldCheck,
      title: 'Відповідальні',
      text: 'Погодились на час — приїхали в цей час. Це найважливіше, що є в цій роботі.',
    },
    {
      icon: Eye,
      title: 'Уважні до дрібниць',
      text: 'Плінтус, дзеркало, ручки дверей. Різницю між «прибрано» і «прибрано добре» роблять саме вони.',
    },
    {
      icon: MessageCircle,
      title: 'Ввічливі в спілкуванні',
      text: 'Ви заходите до людини додому. Спокійна розмова в чаті важить не менше за саму роботу.',
    },
    {
      icon: GraduationCap,
      title: 'Без досвіду — теж можна',
      text: 'Портфоліо й відгуки напрацьовуються тут. Новачків ми не ховаємо, а навпаки — даємо гарантоване місце у видачі.',
    },
    {
      icon: Users,
      title: 'Від 18 років',
      text: 'Нижня межа — 18: ви заходите в чужі помешкання й самі розраховуєтесь із клієнтом. Верхньої межі немає.',
    },
  ]

  // ─── FAQ ───
  // Відповіді конкретні. Там, де правда незручна (сервіс новий, заявок
  // поки небагато), пишемо як є: людина все одно дізнається на другий
  // день, і краще хай дізнається від нас.
  interface QA {
    id: string
    question: string
    answer: string
  }

  const FAQ: readonly QA[] = [
    {
      id: 'start',
      question: 'Як почати працювати на Zunor?',
      answer:
        'Зареєструватись як майстер, заповнити профіль і додати фото. Далі ми переглядаємо анкету, і заявки починають приходити у вашу стрічку. Співбесід і відділу кадрів у нас немає — ви працюєте на себе.',
    },
    {
      id: 'age',
      question: 'З якого віку можна працювати?',
      answer:
        'З 18 років. Це умова роботи в чужих помешканнях і самостійних розрахунків із клієнтом. Верхньої межі немає — у команді є люди різного віку, і жодних обмежень за цим ми не ставимо.',
    },
    {
      id: 'money',
      question: 'Скільки можна заробити?',
      answer:
        'Фіксованої ставки немає: ціну ви називаєте самі в кожному відгуку, а заробіток залежить від того, скільки замовлень берете і як їх оцінюєте. Ми не роботодавець і зарплату не платимо — розрахунок відбувається напряму з клієнтом.',
    },
    {
      id: 'fee',
      question: 'Скільки Zunor бере з майстра?',
      answer:
        'Сьогодні нічого: реєстрація, відгуки й замовлення безкоштовні. Якщо з часом зʼявиться плата, ми попередимо заздалегідь — і вона точно не братиметься за сам відгук наперед, як це роблять дошки оголошень.',
    },
    {
      id: 'schedule',
      question: 'Який графік? Чи можна поєднувати з іншою роботою?',
      answer:
        'Графік складаєте ви. Немає змін, обовʼязкових годин і мінімуму замовлень: не відгукнулись цього тижня — нічого не сталося. Багато хто починає з вихідних, паралельно з основною роботою.',
    },
    {
      id: 'experience',
      question: 'А якщо в мене немає досвіду й відгуків?',
      answer:
        'Це не перешкода. Новий майстер отримує підвищення в підборі на перші дні роботи, а у видачі клієнту завжди є гарантоване місце для новачка з відповідною поміткою. Перші відгуки напрацьовуються швидше, ніж здається.',
    },
    {
      id: 'supplies',
      question: 'Чи треба мати свій інвентар і засоби?',
      answer:
        'Ми інвентар не видаємо — це домовленість між вами й клієнтом. Одні майстри приїжджають зі своїм, іншим зручніше засобами господарів. Це варто узгодити в чаті до підтвердження замовлення.',
    },
    {
      id: 'flow',
      question: 'Скільки буде заявок?',
      answer:
        'Чесно: Zunor щойно запрацював в Одесі, і потік поки невеликий. Саме тому зараз вигідно заходити — у перших майстрів найменша конкуренція за кожну заявку та найбільше шансів набрати відгуки.',
    },
    {
      id: 'contacts',
      question: 'Коли я побачу телефон клієнта?',
      answer:
        'Після того, як клієнт обрав вас і замовлення створено. До цього моменту спілкування йде в чаті — так само як номери майстрів не показуються клієнтам до вибору.',
    },
    {
      id: 'cancel',
      question: 'Що буде, якщо я не зможу приїхати?',
      answer:
        'Скасувати замовлення може будь-яка зі сторін — кнопка є завжди. Попередьте клієнта в чаті якомога раніше: заявка повернеться в пошук, і він встигне знайти іншого майстра.',
    },
    {
      id: 'city',
      question: 'Я не з Одеси. Можна працювати?',
      answer:
        'Поки ні — ми свідомо працюємо в одному місті, доки не доведемо сервіс до ідеалу. Реєструйтесь: коли відкриємо ваше місто, ви дізнаєтесь одним із перших.',
    },
  ]
</script>

<svelte:head>
  <title>Робота клінером в Одесі — приєднуйтесь до Zunor</title>
  <meta
    name="description"
    content="Zunor — сервіс прибирання в Одесі, де заявки приходять до майстра самі. Ви називаєте свою ціну, працюєте за власним графіком і спілкуєтесь із клієнтом напряму. Реєстрація безкоштовна, з 18 років."
  />
  <link rel="canonical" href="https://zunor.org/master/about" />

  <meta property="og:locale" content="uk_UA" />
  <meta property="og:type" content="website" />
  <meta
    property="og:title"
    content="Робота клінером в Одесі — приєднуйтесь до Zunor"
  />
  <meta
    property="og:description"
    content="Заявки приходять самі, ціну називаєте ви, графік — власний. Реєстрація безкоштовна, з 18 років."
  />
  <meta property="og:url" content="https://zunor.org/master/about" />
  <meta property="og:site_name" content="Zunor" />
</svelte:head>

<!-- ─── Спільні цеглинки сторінки ───
     Шапка секції завжди однакова: акцентний надзаголовок, великий
     центрований H2, вузька приглушена підводка. Якщо кожна секція
     починає верстати шапку по-своєму, сторінка розсипається. -->
{#snippet sectionHead(eyebrow: string, title: string, id: string, lead: string)}
  <header class="mx-auto max-w-[46rem] text-center" use:reveal>
    <p
      class="text-[13px] font-semibold tracking-[0.06em] text-(--m-accent) uppercase"
    >
      {eyebrow}
    </p>
    <h2
      {id}
      class="mt-3 text-[clamp(2rem,4vw,3rem)] leading-[1.06] font-bold tracking-[-0.04em] text-balance"
    >
      {title}
    </h2>
    {#if lead}
      <p
        class="mt-5 text-[clamp(1.0625rem,1.7vw,1.3125rem)] leading-[1.5] text-pretty text-muted-foreground"
      >
        {lead}
      </p>
    {/if}
  </header>
{/snippet}

<!-- Іконка без плашки: голий гліф акцентним кольором. Плитка з фоном
     робила з кожної картки «кнопку», а великий гліф читається сам і
     дає сітці повітря. -->
{#snippet icon(Icon: typeof Check)}
  <Icon
    size={34}
    strokeWidth={1.6}
    class="shrink-0 text-(--m-accent)"
    aria-hidden="true"
  />
{/snippet}

{#snippet checkItem(text: string)}
  <li class="flex items-start gap-3 text-[17px] leading-[1.55]">
    <Check
      size={19}
      strokeWidth={2.5}
      class="mt-1 shrink-0 text-(--m-accent)"
      aria-hidden="true"
    />
    {text}
  </li>
{/snippet}

<!-- Текстове посилання-«читати далі»: зі стрілкою, як у Apple, але
     чорно-біле — кольором на цій сторінці говорять тільки іконки й
     цифри, а не дії. Другорядна дія не має важити стільки ж, скільки
     головна кнопка. -->
{#snippet textLink(href: string, label: string)}
  <a {href} class="m-link">
    {label}
    <ChevronRight size={18} strokeWidth={2.25} class="m-link-arrow" />
  </a>
{/snippet}

<!-- Один фон на всю сторінку: секції його не перефарбовують. -->
<main id="main-content" class="master bg-background text-foreground" lang="uk">
  <!-- ═══ HERO ═══
       Рівно на висоту вікна. -mt-14 затягує секцію ПІД шапку — вона
       прозора, поки сторінку не проскролили, тож інакше зверху висів
       би порожній пояс і 100vh перетворювались на 100vh+56px.

       Поява тут — CSS-анімація із затримками, а не той самий
       IntersectionObserver: перший екран видно одразу, спостерігати за
       ним нема сенсу. -->
  <section
    class="relative -mt-14 flex min-h-svh flex-col justify-center px-[clamp(20px,5vw,56px)] pt-20 pb-[clamp(32px,5vw,64px)]"
    aria-labelledby="master-hero-title"
  >
    <div class="mx-auto w-full max-w-[52rem] text-center">
      <h1
        id="master-hero-title"
        class="m-in text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.02] font-bold tracking-[-0.045em] text-balance"
        style="--d: 0ms"
      >
        Робота клінером в Одесі
      </h1>

      <!-- Одне речення. Продаємо можливість, а не пояснюємо, ким ми НЕ
           є: про відсутність ставки людина прочитає нижче, коли вже
           зацікавиться. -->
      <p
        class="m-in mx-auto mt-6 max-w-[38rem] text-[clamp(1.125rem,2vw,1.5rem)] leading-[1.4] text-pretty text-muted-foreground"
        style="--d: 80ms"
      >
        Заявки приходять до вас самі — ви називаєте свою ціну і працюєте у свій
        час.
      </p>

      <div
        class="m-in mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-4"
        style="--d: 160ms"
      >
        <Button
          href="/user/register"
          class="m-cta h-13 gap-2 rounded-xl px-8 text-[17px] font-semibold"
        >
          Стати майстром
          <ArrowRight class="m-cta-arrow size-4.5" aria-hidden="true" />
        </Button>
        {@render textLink('#yak-pochaty', 'Як це працює')}
      </div>
    </div>
  </section>

  <!-- ═══ ФАКТИ Й ІЛЮСТРАЦІЯ ═══
       Смуга умов роботи (у референсу тут суми заробітку — у нас сум
       бути не може) і велике фото. Обидва блоки свідомо ЗА межами
       першого екрана: на ньому має лишитись рівно заголовок, рядок
       пояснення і дія.

       Смуга без рамок і роздільників: ритм задає сітка, лінії тільки
       додали б шуму. -->
  <section class="px-[clamp(20px,5vw,56px)] pb-[clamp(64px,8vw,132px)]">
    <ul
      class="mx-auto grid max-w-[1120px] grid-cols-2 gap-x-6 gap-y-8 pb-[clamp(48px,6vw,88px)] text-center lg:grid-cols-4"
      use:reveal
    >
      {#each FACTS as [title, text] (title)}
        <li>
          <p
            class="text-[clamp(1.35rem,2.6vw,1.875rem)] font-bold tracking-[-0.035em] text-(--m-accent)"
          >
            {title}
          </p>
          <p
            class="mx-auto mt-2 max-w-[15rem] text-[14.5px] leading-[1.45] text-pretty text-muted-foreground"
          >
            {text}
          </p>
        </li>
      {/each}
    </ul>

    <div
      class="mx-auto aspect-[16/10] w-full max-w-[1120px] overflow-hidden rounded-[clamp(20px,2.5vw,32px)] bg-secondary/60 sm:aspect-[16/7]"
      use:reveal
    >
      <img
        src="/master-hero.png"
        alt="Клінер Zunor за роботою"
        class="size-full object-cover"
      />
    </div>
  </section>

  <!-- ═══ ЧОМУ ZUNOR ═══ -->
  <section
    class="px-[clamp(20px,5vw,56px)] pb-[clamp(64px,8vw,132px)]"
    aria-labelledby="chomu-zunor"
  >
    <div class="mx-auto max-w-[1120px]">
      {@render sectionHead(
        'Чому Zunor',
        'Сервіс, побудований на боці майстра',
        'chomu-zunor',
        'Ми не дошка оголошень, де платять за можливість написати клієнту першим, і не клінінгова компанія, яка ставить вас у зміну.',
      )}

      <ul
        class="mt-[clamp(40px,5vw,72px)] grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {#each BENEFITS as item, i (item.title)}
          <!-- Затримка по індексу в межах рядка сітки: картки
               підхоплюються одна за одною, а не спалахують разом. -->
          <li class="rounded-xl bg-secondary/60 p-7" use:reveal={(i % 4) * 70}>
            {@render icon(item.icon)}
            <h3
              class="mt-5 mb-2 text-[1.0625rem] leading-snug font-semibold tracking-[-0.02em] text-balance"
            >
              {item.title}
            </h3>
            <p
              class="text-[15px] leading-[1.55] text-pretty text-muted-foreground"
            >
              {item.text}
            </p>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <!-- ═══ ЩО ЦЕ ЗА РОБОТА ═══ -->
  <section
    class="px-[clamp(20px,5vw,56px)] pb-[clamp(64px,8vw,132px)]"
    aria-labelledby="shcho-za-robota"
  >
    <div class="mx-auto max-w-[1120px]">
      {@render sectionHead(
        'Що це за робота',
        'Прибирання квартир, будинків та офісів',
        'shcho-za-robota',
        'Zunor займається однією послугою. Саме тому в заявці одразу видно тип помешкання, обсяг і побажання клієнта — половину деталей не доведеться зʼясовувати в чаті.',
      )}

      <div class="mt-[clamp(40px,5vw,72px)] grid gap-4 md:grid-cols-2">
        {#each WORK_TYPES as item, i (item.title)}
          <div
            class="rounded-xl bg-secondary/60 p-8 sm:p-10"
            use:reveal={i * 90}
          >
            {@render icon(item.icon)}
            <h3
              class="mt-6 mb-3 text-[clamp(1.25rem,2vw,1.5rem)] font-semibold tracking-[-0.03em] text-balance"
            >
              {item.title}
            </h3>
            <p
              class="text-[17px] leading-[1.55] text-pretty text-muted-foreground"
            >
              {item.text}
            </p>
          </div>
        {/each}
      </div>

      <ul class="mt-8 flex flex-wrap justify-center gap-2" use:reveal>
        {#each CLEANING_KINDS as kind (kind)}
          <li
            class="rounded-full bg-secondary/60 px-5 py-2.5 text-[15px] text-muted-foreground"
          >
            {kind}
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <!-- ═══ СКІЛЬКИ І КОЛИ ═══
       Тут у рекрутингових лендінгів стоїть таблиця «грн/день». У нас
       ставки немає в принципі, тому блок відповідає на те саме питання
       чесно: показує МЕХАНІКУ грошей і формати навантаження. -->
  <section
    class="px-[clamp(20px,5vw,56px)] pb-[clamp(64px,8vw,132px)]"
    aria-labelledby="skilky-i-koly"
  >
    <div class="mx-auto max-w-[1120px]">
      {@render sectionHead(
        'Скільки і коли',
        'Ставки немає — і це головна перевага',
        'skilky-i-koly',
        'Ми не обіцяємо «від 36 000 грн на місяць», бо не платимо зарплату. Вартість роботи щоразу називаєте ви самі.',
      )}

      <div
        class="mt-[clamp(40px,5vw,72px)] grid gap-4 lg:grid-cols-[1.05fr_1fr]"
      >
        <!-- Механіка грошей: чотири кроки від заявки до розрахунку. -->
        <div class="rounded-xl bg-secondary/60 p-8 sm:p-10" use:reveal>
          <h3
            class="text-[clamp(1.25rem,2vw,1.5rem)] font-semibold tracking-[-0.03em]"
          >
            Як формується оплата
          </h3>
          <ol class="mt-8 flex flex-col">
            {#each PAYMENT_STEPS as step, i (step)}
              <li class="flex gap-5 pb-7 last:pb-0">
                <!-- Номер і лінія між кроками: показує, що це
                     послідовність, а не просто список. -->
                <span
                  class="flex flex-col items-center gap-2"
                  aria-hidden="true"
                >
                  <span
                    class="m-num grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-semibold tabular-nums"
                  >
                    {i + 1}
                  </span>
                  {#if i < PAYMENT_STEPS.length - 1}
                    <span class="w-px flex-1 bg-border"></span>
                  {/if}
                </span>
                <span class="pt-1.5 text-[17px] leading-[1.5] text-pretty">
                  {step}
                </span>
              </li>
            {/each}
          </ol>
        </div>

        <!-- Формати навантаження. -->
        <div class="flex flex-col gap-4">
          {#each FORMATS as item, i (item.title)}
            <div
              class="flex flex-1 items-start gap-5 rounded-xl bg-secondary/60 p-7"
              use:reveal={i * 90}
            >
              {@render icon(item.icon)}
              <div>
                <h3
                  class="mb-2 text-[1.125rem] font-semibold tracking-[-0.025em] text-balance"
                >
                  {item.title}
                </h3>
                <p
                  class="text-[15px] leading-[1.55] text-pretty text-muted-foreground"
                >
                  {item.text}
                </p>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <!-- ═══ ЯК ПОЧАТИ ═══ -->
  <section
    id="yak-pochaty"
    class="scroll-mt-20 px-[clamp(20px,5vw,56px)] pb-[clamp(64px,8vw,132px)]"
    aria-labelledby="yak-pochaty-title"
  >
    <div class="mx-auto max-w-[1120px]">
      {@render sectionHead(
        'Як почати',
        'Від реєстрації до першої заявки',
        'yak-pochaty-title',
        'Співбесід, папок з документами й випробувального терміну немає. Усе відбувається в застосунку.',
      )}

      <ol
        class="mt-[clamp(40px,5vw,72px)] grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8"
      >
        {#each STEPS as step, i (step.title)}
          <li use:reveal={i * 80}>
            {@render icon(step.icon)}
            <p
              class="mt-5 text-[13px] font-semibold tracking-[0.06em] text-(--m-accent) tabular-nums"
              aria-hidden="true"
            >
              КРОК {i + 1}
            </p>
            <h3
              class="mt-2 mb-2 text-[1.25rem] font-semibold tracking-[-0.03em] text-balance"
            >
              {step.title}
            </h3>
            <p
              class="text-[15.5px] leading-[1.55] text-pretty text-muted-foreground"
            >
              {step.text}
            </p>
          </li>
        {/each}
      </ol>

      <div class="mt-[clamp(36px,4vw,56px)] flex justify-center" use:reveal>
        <Button
          href="/user/register"
          class="m-cta h-13 gap-2 rounded-xl px-8 text-[17px] font-semibold"
        >
          Створити профіль
          <ArrowRight class="m-cta-arrow size-4.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  </section>

  <!-- ═══ ЩО ВСЕРЕДИНІ ═══
       Два блоки з ілюстраціями: стрічка заявок і картка замовлення.
       Показати екран важливіше за опис — людина одразу бачить, з чим
       матиме справу щодня. -->
  <section
    class="px-[clamp(20px,5vw,56px)] pb-[clamp(64px,8vw,132px)]"
    aria-labelledby="shcho-vseredyni"
  >
    <div
      class="mx-auto flex max-w-[1120px] flex-col gap-[clamp(48px,6vw,96px)]"
    >
      <div
        class="grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16"
      >
        <div use:reveal>
          <p
            class="text-[13px] font-semibold tracking-[0.06em] text-(--m-accent) uppercase"
          >
            Стрічка заявок
          </p>
          <h2
            id="shcho-vseredyni"
            class="mt-3 text-[clamp(1.75rem,3.2vw,2.5rem)] leading-[1.08] font-bold tracking-[-0.04em] text-balance"
          >
            Робота поруч — без пошуку клієнтів
          </h2>
          <p
            class="mt-4 text-[17px] leading-[1.55] text-pretty text-muted-foreground"
          >
            Заявки з вашого міста приходять самі. Деталі, район і бажаний час
            видно ще до того, як ви вирішите відгукнутись.
          </p>
          <ul class="mt-7 flex flex-col gap-3.5">
            {#each FEED_POINTS as point (point)}
              {@render checkItem(point)}
            {/each}
          </ul>
        </div>
        <div
          class="aspect-[4/3] w-full overflow-hidden rounded-xl bg-secondary/60"
          use:reveal={90}
        >
          <img
            src="/feat-feed.png"
            alt="Стрічка заявок у застосунку Zunor"
            class="size-full object-cover"
          />
        </div>
      </div>

      <div
        class="grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16"
      >
        <div
          class="order-1 aspect-[4/3] w-full overflow-hidden rounded-xl bg-secondary/60 md:order-0"
          use:reveal
        >
          <img
            src="/feat-order.png"
            alt="Картка замовлення у застосунку Zunor"
            class="size-full object-cover"
          />
        </div>
        <div use:reveal={90}>
          <p
            class="text-[13px] font-semibold tracking-[0.06em] text-(--m-accent) uppercase"
          >
            Ваш відгук
          </p>
          <h2
            class="mt-3 text-[clamp(1.75rem,3.2vw,2.5rem)] leading-[1.08] font-bold tracking-[-0.04em] text-balance"
          >
            Ви керуєте ціною та умовами
          </h2>
          <p
            class="mt-4 text-[17px] leading-[1.55] text-pretty text-muted-foreground"
          >
            Надсилаєте відгук зі своєю вартістю, узгоджуєте деталі в чаті й
            підтверджуєте лише ті замовлення, які вам підходять.
          </p>
          <ul class="mt-7 flex flex-col gap-3.5">
            {#each ORDER_POINTS as point (point)}
              {@render checkItem(point)}
            {/each}
          </ul>
        </div>
      </div>
    </div>
  </section>

  <!-- ═══ КОГО ШУКАЄМО ═══ -->
  <section
    class="px-[clamp(20px,5vw,56px)] pb-[clamp(64px,8vw,132px)]"
    aria-labelledby="kogo-shukaemo"
  >
    <div class="mx-auto max-w-[1120px]">
      {@render sectionHead(
        'Кого шукаємо',
        'Диплом не потрібен. Потрібне ставлення',
        'kogo-shukaemo',
        'На Zunor клієнт обирає конкретну людину, а не «виконавця №4827». Тому важливо не скільки років ви прибираєте, а як ви це робите.',
      )}

      <ul
        class="mt-[clamp(40px,5vw,72px)] grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {#each WHO as item, i (item.title)}
          <li class="rounded-xl bg-secondary/60 p-8" use:reveal={(i % 3) * 70}>
            {@render icon(item.icon)}
            <h3
              class="mt-5 mb-2 text-[1.25rem] font-semibold tracking-[-0.03em] text-balance"
            >
              {item.title}
            </h3>
            <p
              class="text-[15.5px] leading-[1.55] text-pretty text-muted-foreground"
            >
              {item.text}
            </p>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <!-- ═══ FAQ ═══ -->
  <section
    id="zapytannya"
    class="scroll-mt-20 px-[clamp(20px,5vw,56px)] pb-[clamp(64px,8vw,132px)]"
    aria-labelledby="faq-master"
  >
    <div class="mx-auto max-w-[800px]">
      {@render sectionHead(
        'Запитання',
        'Що питають найчастіше',
        'faq-master',
        '',
      )}

      <!-- type="single" — відкрита лише одна відповідь: не губиться
           серед сусідніх розгорнутих блоків. -->
      <div
        class="mt-[clamp(32px,4vw,56px)] rounded-xl bg-secondary/60 px-6 sm:px-8"
        use:reveal
      >
        <Accordion.Root type="single" class="w-full">
          {#each FAQ as item (item.id)}
            <Accordion.Item
              value={item.id}
              class="border-b border-border/70 last:border-b-0"
            >
              <Accordion.Trigger
                class="py-6 text-start text-[17px] font-medium tracking-[-0.015em] hover:no-underline"
              >
                {item.question}
              </Accordion.Trigger>
              <Accordion.Content
                class="pb-6 text-[15.5px] leading-[1.6] text-muted-foreground"
              >
                {item.answer}
              </Accordion.Content>
            </Accordion.Item>
          {/each}
        </Accordion.Root>
      </div>
    </div>
  </section>

  <!-- ═══ CTA ═══
       Замість форми заявки з референсу — пряме посилання на реєстрацію:
       акаунт усе одно потрібен, і зайвий крок «залиште номер, ми
       передзвонимо» лише додає очікування. -->
  <section
    class="px-[clamp(20px,5vw,56px)] pb-[clamp(72px,9vw,144px)] text-center"
  >
    <div class="mx-auto max-w-[46rem]" use:reveal>
      <h2
        class="text-[clamp(2rem,4.4vw,3.25rem)] leading-[1.05] font-bold tracking-[-0.045em] text-balance"
      >
        Заявки в Одесі вже чекають
      </h2>
      <p
        class="mx-auto mt-5 max-w-[36rem] text-[clamp(1.0625rem,1.8vw,1.375rem)] leading-[1.45] text-pretty text-muted-foreground"
      >
        Реєстрація безкоштовна й займає кілька хвилин. Мінімуму замовлень немає:
        спробуйте одне — і вирішите далі.
      </p>

      <div
        class="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-4"
      >
        <Button
          href="/user/register"
          class="m-cta h-13 gap-2 rounded-xl px-8 text-[17px] font-semibold"
        >
          Стати майстром
          <ArrowRight class="m-cta-arrow size-4.5" aria-hidden="true" />
        </Button>
        {@render textLink('#zapytannya', 'Залишились питання')}
      </div>
    </div>
  </section>
</main>

<style>
  /* Єдиний кольоровий акцент сторінки — той самий синій, що плашка «AI»
     на головній. Одна змінна на всі місця (іконки, надзаголовки,
     цифри), щоб вони не розійшлися по відтінках при наступній правці.

     Не з токенів теми навмисно: --primary теракотовий і на ньому
     тримається застосунок, а лендінг говорить іншим кольором.

     Дії цим кольором НЕ фарбуються: кнопка чорно-біла, як на всьому
     сайті. Якщо синім світиться і акцент, і кнопка, акцент перестає
     бути акцентом. */
  .master {
    --m-accent: #2563eb;
  }

  /* Кружок з номером кроку. Окремим правилом, бо колір тут — наша
     змінна, а не токен теми. */
  .m-num {
    background: var(--m-accent);
    color: #ffffff;
  }

  /* Текстове посилання зі стрілкою — друга за важливістю дія. */
  .m-link {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    font-size: 17px;
    font-weight: 500;
    color: var(--foreground);
  }

  .m-link:hover {
    text-decoration: underline;
  }

  .m-link:focus-visible {
    outline: 2px solid var(--foreground);
    outline-offset: 3px;
    border-radius: 4px;
  }

  /* Стрілки їдуть уперед на hover: мікрорух, який каже «це перехід».
     :global обовʼязковий — <svg> малює компонент lucide, а кнопку —
     компонент Button, і хеша нашої області видимості на них немає. Без
     обгортки Svelte викинув би ці правила як невикористані, мовчки. */
  .master :global(.m-cta .m-cta-arrow),
  .m-link :global(.m-link-arrow) {
    transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .master :global(.m-cta:hover .m-cta-arrow),
  .m-link:hover :global(.m-link-arrow) {
    transform: translateX(3px);
  }

  /* Поява першого екрана — на завантаженні, із затримкою по --d.
     Нижче по сторінці працює use:reveal ($lib/utils/reveal): там
     потрібен момент перетину вьюпорта, а не монтування. */
  .m-in {
    animation: m-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: var(--d, 0ms);
  }

  @keyframes m-rise {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .m-in {
      animation: none;
    }

    .master :global(.m-cta .m-cta-arrow),
    .m-link :global(.m-link-arrow) {
      transition: none;
    }

    .master :global(.m-cta:hover .m-cta-arrow),
    .m-link:hover :global(.m-link-arrow) {
      transform: none;
    }
  }
</style>
