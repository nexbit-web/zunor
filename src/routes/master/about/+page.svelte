<!--
  /master/about — публічний лендинг для майстрів Zunor.
  Преміум-мінімалізм, монохром, шрифт Onest, Tailwind v4 — усе на семантичних токенах (тема).
  Картинки — підставте свій <img> у плейсхолдери.
  Залежності: lucide-svelte.
-->
<script lang="ts">
  import {
    Clock,
    MapPin,
    DollarSign,
    Star,
    ShieldCheck,
    CreditCard,
    UserPlus,
    BadgeCheck,
    Bell,
    Wallet,
    Check,
    ArrowRight,
    type Icon as LucideIcon,
    Tag,
  } from 'lucide-svelte'

  interface Item {
    icon: typeof LucideIcon
    title: string
    text: string
  }

  const benefits: Item[] = [
    {
      icon: Clock,
      title: 'Вільний графік',
      text: 'Працюйте тоді, коли зручно вам. Жодних змін і обовʼязкових годин.',
    },
    {
      icon: MapPin,
      title: 'Замовлення поруч',
      text: 'Отримуйте заявки з вашого району — менше часу на дорогу.',
    },
    {
      icon: Tag,
      title: 'Ваша ціна',
      text: 'Ви самі вказуєте вартість у відгуку на замовлення.',
    },
    {
      icon: Star,
      title: 'Репутація та відгуки',
      text: 'Хороші відгуки піднімають вас у видачі й приносять більше клієнтів.',
    },
    {
      icon: ShieldCheck,
      title: 'Безпека та підтримка',
      text: 'Верифікація, чат у застосунку та підтримка, якщо щось піде не так.',
    },
    {
      icon: CreditCard,
      title: 'Прозора оплата',
      text: 'Отримуйте оплату за виконані замовлення без зайвих посередників.',
    },
  ]

  const steps: Item[] = [
    {
      icon: UserPlus,
      title: 'Реєстрація',
      text: 'Створіть акаунт майстра за кілька хвилин.',
    },
    {
      icon: BadgeCheck,
      title: 'Профіль і верифікація',
      text: 'Заповніть профіль, додайте послуги та пройдіть перевірку.',
    },
    {
      icon: Bell,
      title: 'Приймайте замовлення',
      text: 'Отримуйте заявки поруч і надсилайте відгуки зі своєю ціною.',
    },
    {
      icon: Wallet,
      title: 'Отримуйте оплату',
      text: 'Виконуйте роботу та отримуйте оплату за результат.',
    },
  ]

  const feat1 = [
    'Стрічка доступних заявок у реальному часі',
    'Фільтр за типом прибирання та районом',
    'Усі деталі замовлення — одразу в картці',
  ]
  const feat2 = [
    'Власна вартість у кожному відгуку',
    'Чат із клієнтом усередині застосунку',
    'Оплата за результат виконаної роботи',
  ]

  const stats: [string, string][] = [
    ['Власний графік', 'Працюйте тоді, коли зручно вам'],
    ['Своя ціна', 'Ви вказуєте вартість у відгуку'],
    ['Оплата за роботу', 'Напряму, без посередників'],
  ]
</script>

{#snippet eyebrow(label: string)}
  <p
    class="flex items-center gap-2.5 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase"
  >
    <span class="h-px w-6 bg-foreground" aria-hidden="true"></span>
    {label}
  </p>
{/snippet}

{#snippet checkItem(text: string)}
  <li class="flex items-start gap-3 text-base leading-normal">
    <Check
      size={20}
      strokeWidth={2}
      class="mt-0.5 shrink-0"
      aria-hidden="true"
    />
    {text}
  </li>
{/snippet}

<svelte:head>
  <title>Стати майстром Zunor — заробляйте на прибиранні у свій час</title>
  <meta
    name="description"
    content="Zunor зʼєднує майстрів із прибирання з клієнтами поруч. Обирайте замовлення, встановлюйте свою ціну та працюйте за власним графіком."
  />
</svelte:head>

<!-- HERO -->
<section
  class="mx-auto max-w-295 px-5 pt-12 pb-16 sm:px-8 md:pt-20 md:pb-24 lg:px-14"
  aria-labelledby="master-hero-title"
>
  <div
    class="grid grid-cols-1 items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] md:gap-16"
  >
    <div class="max-w-130">
      {@render eyebrow('Zunor для майстрів')}
      <h1
        id="master-hero-title"
        class="mt-5 text-[clamp(36px,5vw,60px)] leading-[1.03] font-extrabold tracking-[-0.04em] text-balance text-foreground"
      >
        Беріть замовлення на прибирання — у свій час і за свою ціну
      </h1>
      <p
        class="mt-5 text-[clamp(16px,1.7vw,19px)] leading-[1.58] text-pretty text-muted-foreground"
      >
        Zunor зʼєднує вас із клієнтами поруч, яким потрібне прибирання. Ви
        обираєте, які замовлення брати, коли працювати та скільки це коштує —
        без посередників між вами та клієнтом.
      </p>
      <div class="mt-8 flex flex-wrap items-center gap-6">
        <a
          href="/user/register"
          class="group inline-flex h-13.5 items-center justify-center gap-2.5 rounded-xl bg-foreground px-7.5 text-base font-semibold tracking-[-0.01em] text-background transition hover:opacity-90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40 motion-reduce:transition-none"
        >
          Стати майстром
          <ArrowRight
            size={18}
            strokeWidth={2.2}
            class="transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </a>
        <a
          href="#yak-pochaty"
          class="rounded-sm border-b-[1.5px] border-foreground pb-0.75 text-base font-semibold tracking-[-0.01em] text-foreground transition-colors hover:border-muted-foreground hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
        >
          Як це працює
        </a>
      </div>
    </div>

    <!-- ілюстрація: підставте свій <img> -->
    <div
      class="h-[clamp(360px,40vw,540px)] w-full overflow-hidden rounded-[20px] bg-muted"
    >
      <img
        src="/master-hero.png"
        alt="Майстер за роботою"
        class="size-full object-cover"
      />
    </div>
  </div>

  <!-- stat strip -->
  <div
    class="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[18px] border border-border bg-border sm:grid-cols-3"
  >
    {#each stats as [num, label] (label)}
      <div class="bg-background px-7 py-6">
        <div
          class="text-[clamp(22px,2.6vw,28px)] font-bold tracking-[-0.03em] text-foreground"
        >
          {num}
        </div>
        <div class="mt-1 text-sm text-muted-foreground">{label}</div>
      </div>
    {/each}
  </div>
</section>

<!-- FEATURE BLOCKS -->
<section
  id="pereavagy"
  class="mx-auto max-w-295 scroll-mt-20 px-5 pb-16 sm:px-8 md:pb-24 lg:px-14"
>
  <!-- block 1 -->
  <div class="grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16">
    <div class="max-w-115">
      {@render eyebrow('Замовлення поруч')}
      <h2
        class="mt-4 text-[clamp(26px,3.4vw,38px)] leading-[1.1] font-bold tracking-[-0.035em] text-balance text-foreground"
      >
        Робота у вашому районі — без зайвих поїздок
      </h2>
      <p
        class="mt-4 text-[clamp(15.5px,1.6vw,17.5px)] leading-[1.6] text-pretty text-muted-foreground"
      >
        Отримуйте заявки від клієнтів поблизу. Дивіться деталі замовлення, район
        і час ще до того, як відгукнутися.
      </p>
      <ul class="mt-6 flex flex-col gap-3 text-foreground">
        {#each feat1 as point (point)}
          {@render checkItem(point)}
        {/each}
      </ul>
    </div>
    <div
      class="h-[clamp(320px,36vw,460px)] w-full overflow-hidden rounded-[20px] bg-muted"
    >
      <img
        src="/feat-feed.png"
        alt="Стрічка заявок"
        class="size-full object-cover"
      />
    </div>
  </div>

  <!-- block 2 (reversed) -->
  <div
    class="mt-16 grid grid-cols-1 items-center gap-10 md:mt-26 md:grid-cols-2 md:gap-16"
  >
    <div
      class="order-1 h-[clamp(320px,36vw,460px)] w-full overflow-hidden rounded-[20px] bg-muted md:order-0"
    >
      <img
        src="/feat-order.png"
        alt="Картка замовлення"
        class="size-full object-cover"
      />
    </div>
    <div class="max-w-115">
      {@render eyebrow('Ваші умови')}
      <h2
        class="mt-4 text-[clamp(26px,3.4vw,38px)] leading-[1.1] font-bold tracking-[-0.035em] text-balance text-foreground"
      >
        Ви керуєте ціною та графіком
      </h2>
      <p
        class="mt-4 text-[clamp(15.5px,1.6vw,17.5px)] leading-[1.6] text-pretty text-muted-foreground"
      >
        Жодних змін і обовʼязкових годин. Надсилайте відгук зі своєю вартістю,
        спілкуйтеся з клієнтом у чаті та підтверджуйте лише ті замовлення, які
        вам підходять.
      </p>
      <ul class="mt-6 flex flex-col gap-3 text-foreground">
        {#each feat2 as point (point)}
          {@render checkItem(point)}
        {/each}
      </ul>
    </div>
  </div>
</section>

<!-- BENEFITS GRID -->
<section class="bg-secondary/30 px-5 py-16 sm:px-8 md:py-24 lg:px-14">
  <div class="mx-auto max-w-295">
    <div class="mb-12 max-w-140">
      {@render eyebrow('Чому Zunor')}
      <h2
        class="mt-4 text-[clamp(28px,4vw,44px)] leading-[1.08] font-bold tracking-[-0.035em] text-balance text-foreground"
      >
        Усе, що потрібно для роботи — в одному застосунку
      </h2>
    </div>
    <ul class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
      {#each benefits as b (b.title)}
        <li
          class="rounded-[18px] border border-border bg-background p-7 transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_18px_44px_-24px_rgba(0,0,0,0.22)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          <div
            class="mb-5 flex size-11.5 items-center justify-center rounded-[13px] bg-foreground text-background"
          >
            <b.icon size={22} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <h3
            class="mb-2 text-lg font-semibold tracking-[-0.02em] text-foreground"
          >
            {b.title}
          </h3>
          <p
            class="text-[15px] leading-[1.55] text-pretty text-muted-foreground"
          >
            {b.text}
          </p>
        </li>
      {/each}
    </ul>
  </div>
</section>

<!-- HOW TO START -->
<section
  id="yak-pochaty"
  class="mx-auto max-w-295 scroll-mt-20 px-5 py-16 sm:px-8 md:py-24 lg:px-14"
>
  <div class="mb-12 max-w-140">
    {@render eyebrow('Як почати')}
    <h2
      class="mt-4 text-[clamp(28px,4vw,44px)] leading-[1.08] font-bold tracking-[-0.035em] text-balance text-foreground"
    >
      Від реєстрації до першого замовлення
    </h2>
  </div>
  <ol
    class="grid grid-cols-1 gap-9 sm:grid-cols-2 min-[860px]:grid-cols-4 min-[860px]:gap-0"
  >
    {#each steps as step, i (step.title)}
      <li
        class="relative min-[860px]:border-l min-[860px]:border-border min-[860px]:px-8 min-[860px]:first:border-l-0 min-[860px]:first:pl-0 min-[860px]:last:pr-0"
      >
        <span
          class="mb-6 block text-[13px] font-semibold tracking-[0.04em] text-muted-foreground tabular-nums"
          aria-hidden="true"
        >
          <span class="text-foreground">{String(i + 1).padStart(2, '0')}</span>
          &nbsp;/&nbsp; 0{steps.length}
        </span>
        <div class="mb-5 text-foreground">
          <step.icon size={26} strokeWidth={1.6} aria-hidden="true" />
        </div>
        <h3
          class="mb-2 text-lg font-semibold tracking-[-0.02em] text-foreground"
        >
          {step.title}
        </h3>
        <p class="text-[15px] leading-[1.55] text-pretty text-muted-foreground">
          {step.text}
        </p>
      </li>
    {/each}
  </ol>
</section>

<!-- CLOSING CTA -->
<section class="mx-auto max-w-295 px-5 pb-16 sm:px-8 md:pb-24 lg:px-14">
  <div
    class="rounded-[28px] bg-foreground px-6 py-14 text-center text-background sm:px-16 md:py-22"
  >
    <h2
      class="text-zunor-gradient mx-auto max-w-160 text-[clamp(28px,4vw,46px)] leading-[1.06] font-extrabold tracking-[-0.04em] text-balance"
    >
      Готові почати заробляти з Zunor?
    </h2>
    <p
      class="mx-auto mt-4 max-w-120 text-[clamp(15px,1.6vw,18px)] leading-[1.55] text-pretty text-background/65"
    >
      Реєстрація безкоштовна. Перегляньте доступні замовлення у вашому місті вже
      сьогодні.
    </p>
    <a
      href="/user/register"
      class="mx-auto mt-8 inline-flex h-14 items-center justify-center gap-2.5 rounded-[13px] bg-background px-8.5 text-[16.5px] font-semibold tracking-[-0.01em] text-foreground transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-14px_rgba(0,0,0,0.5)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-background/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      Стати майстром
      <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" />
    </a>
  </div>
</section>
