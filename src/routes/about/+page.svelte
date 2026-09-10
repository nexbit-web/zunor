<!--
  /about — сторінка «про нас» для КЛІЄНТА.

  Посилання на неї вже стояло в шапці й у підвалі («Про нас»), але самої
  сторінки не існувало — обидва вели в 404.

  Зміст — прямий переказ `MANIFESTO.md` людською мовою: п'ять
  уникальностей (розділ 2), уроки конкурента (розділ 13) і чесна стадія
  проєкту (розділ 10). Сторінка не вигадує нічого понад те, що вже
  працює в коді.

  ⚠️ Чого тут свідомо НЕМАЄ:
    • слова про комісію, ціни й «безкоштовно» — монетизації в проєкті
      нема взагалі, а розвилка «комісія чи лід-фі» не вирішена
      (маніфест, р. 8.1). Обіцяти щось із цього публічно = зв'язати собі
      руки до того, як рішення прийняте;
    • назви конкурента. Порівняння є, воно чесне, але сторінка «про нас»
      має розповідати про нас, а не про когось;
    • вигаданих цифр («500+ клієнтів», «4.9 рейтинг») — сервіс на старті,
      і розділ «Де ми зараз» каже про це прямо.

  Дизайн тримається мови лендінгу: плаский фон, рамки замість тіней,
  clamp-типографіка, один синій акцент (той самий, що плашка «AI» в
  hero). Розмітка вся тут, як і в /master/about — це контент-сторінка,
  а не набір компонентів для повторного використання.
-->
<script lang="ts">
  // Точкові імпорти, а не barrel 'lucide-svelte': бочка реекспортує
  // ~1700 .svelte-іконок і поїхала б у чанк цієї сторінки цілком.
  import MapPin from '@lucide/svelte/icons/map-pin'
  import Check from '@lucide/svelte/icons/check'
  import X from '@lucide/svelte/icons/x'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'

  const SEO = {
    title: 'Про Zunor — прибирання в Одесі, де не треба нікого шукати',
    description:
      'Zunor — сервіс прибирання в Одесі: ви описуєте завдання своїми словами, а вільні клінери поруч відгукуються самі з ціною та часом. Розповідаємо, як це працює і у що ми віримо.',
    url: 'https://zunor.org/about',
  }

  // Три факти замість трьох вигаданих цифр. Кожен — рішення з маніфесту,
  // а не маркетингова обіцянка: одна вертикаль, одне місто, ручна
  // перевірка анкет.
  const FACTS: readonly [string, string][] = [
    ['Одна послуга', 'Тільки прибирання — і розібране до дрібниць'],
    ['Одне місто', 'Одеса. Далі підемо, коли тут працюватиме ідеально'],
    ['Ручна перевірка', 'Кожну анкету клінера дивимось очима'],
  ]

  const USUAL = [
    'Гортати десятки анкет без облич',
    'Дзвонити п’ятьом і кожному пояснювати те саме',
    'Дізнаватися ціну вже на порозі',
    'Обирати навмання й сподіватися',
  ] as const

  const OURS = [
    'Описати завдання своїми словами — один раз',
    'Заявку оформить асистент, деталі дозбирає питаннями',
    'Вільні клінери поруч відгукнуться самі, з ціною та часом',
    'Ви обираєте з готових пропозицій, а не з натовпу',
  ] as const

  // П'ять уникальностей із маніфесту (р. 2), переказані мовою клієнта.
  // Порядок той самий — він не випадковий, це від «що ми робимо» до
  // «як ми це робимо чесно».
  const PRINCIPLES = [
    {
      title: 'Глибина замість ширини',
      text: 'Ми не майданчик усіх послуг на світі. Ми робимо одну річ — прибирання — і розбираємо її до дрібниць: звичайне, генеральне, після ремонту, миття вікон, хімчистка меблів. У кожного свої питання, своя термінологія, свій підхід.',
    },
    {
      title: 'Майстри приходять до вас',
      text: 'Каталогу клінерів у нас немає — і не з’явиться. Шукати, порівнювати профілі й писати першим не доведеться: ваша заявка сама йде до тих, хто зараз вільний і поруч. Далі вони пишуть вам.',
    },
    {
      title: 'Реальні люди, а не «виконавець №4827»',
      text: 'У клінера на Zunor є обличчя, ім’я та сторінка з портфоліо й відгуками. Відгуки двосторонні: не лише ви оцінюєте роботу, а й клінер — замовлення. Репутація тут є в обох, і це помітно на кожному кроці.',
    },
    {
      title: 'Сервіс думає, а не змушує думати вас',
      text: 'Ніяких випадаючих списків із категоріями й анкет на п’ять кроків. Ви пишете «треба прибрати двушку після ремонту» — асистент сам зрозуміє тип прибирання, дозбирає деталі й оформить заявку. Класична форма теж є — для тих, хто не хоче розмовляти.',
    },
    {
      title: 'Справедливо до всіх, хто тут працює',
      text: 'Новачок гарантовано отримує місце у видачі, а клінер із трьома активними замовленнями тимчасово опускається нижче, щоб не брати більше, ніж встигає. Це не доброта: коли роботу розкидано рівно, вільна людина знаходиться швидко — і виграє передусім клієнт.',
    },
  ] as const

  // Обіцянки, за які можна спитати ЗАВТРА, бо всі вони вже в коді.
  // Нічого «планового» тут бути не повинно.
  const PROMISES = [
    {
      title: 'Телефон — тільки після домовленості',
      text: 'До того, як ви обрали клінера, номера не бачить ніхто: ні в стрічці, ні в заявці, ні в профілі. Спілкування — у чаті всередині сервісу.',
    },
    {
      title: 'Скасувати можна завжди',
      text: 'Кнопка є в обох сторін і на будь-якому етапі. Якщо клінер відмовився — заявка автоматично повертається в пошук, і ви не лишаєтесь ні з чим.',
    },
    {
      title: 'Обираєте ви, а не алгоритм',
      text: 'Ми підбираємо й показуємо найкращих, але нікого не призначаємо за вас. Усі, хто відгукнувся, лишаються на екрані — нікого не сховано.',
    },
    {
      title: 'Ціну називає той, хто працює',
      text: 'Не ми і не ви навмання. Клінер сам вказує вартість у відгуку на вашу заявку — і ви бачите кілька пропозицій поруч, перш ніж обрати.',
    },
    {
      title: 'Новачків не ховаємо',
      text: 'Кожен новий клінер бачить заявки з першого дня й потрапляє у видачу з поміткою «Новачок». Ви завжди знаєте, з ким маєте справу.',
    },
    {
      title: 'Якщо щось пішло не так — розбираємось',
      text: 'Особисто й швидко, а не шаблонною відпискою. Нас поки небагато, і це той випадок, коли розмір — перевага.',
    },
  ] as const
</script>

<svelte:head>
  <title>{SEO.title}</title>
  <meta name="description" content={SEO.description} />
  <link rel="canonical" href={SEO.url} />

  <meta property="og:locale" content="uk_UA" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={SEO.title} />
  <meta property="og:description" content={SEO.description} />
  <meta property="og:url" content={SEO.url} />
  <meta property="og:site_name" content="Zunor" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={SEO.title} />
  <meta name="twitter:description" content={SEO.description} />
</svelte:head>

{#snippet eyebrow(label: string)}
  <p
    class="mb-3 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase"
  >
    {label}
  </p>
{/snippet}

<main id="main-content" class="about text-foreground" lang="uk">
  <!-- ═══ Обіцянка сторінки одним екраном ═══ -->
  <section
    class="px-[clamp(20px,5vw,56px)] pt-[clamp(48px,7vw,88px)] pb-[clamp(40px,5vw,64px)]"
    aria-labelledby="about-title"
  >
    <div class="mx-auto max-w-[1120px]">
      <p
        class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
      >
        <MapPin size={15} strokeWidth={2} aria-hidden="true" />
        Одеса, UA
      </p>

      <h1
        id="about-title"
        class="mt-5 max-w-[16ch] text-[clamp(2.25rem,4.6vw,3.75rem)] leading-[1.03] font-bold tracking-[-0.035em] text-balance"
      >
        Прибирання, у якому не треба нікого шукати
      </h1>

      <p
        class="mt-6 max-w-[46rem] text-[clamp(1rem,1.6vw,1.1875rem)] leading-[1.6] text-pretty text-muted-foreground"
      >
        Zunor — це сервіс прибирання в Одесі, побудований навпаки до звичного.
        Ви не гортаєте каталог і не обираєте з натовпу: ви описуєте завдання
        своїми словами, а вільні клінери поруч відгукуються самі — з ціною та
        часом. Наша робота — зробити так, щоб ваша закінчилась на першому
        реченні.
      </p>

      <!-- Смуга фактів. Навмисно без цифр: сервіс на старті, і будь-яке
           «500+ клієнтів» тут було б неправдою в першому ж рядку. -->
      <ul
        class="mt-[clamp(32px,4vw,52px)] grid grid-cols-1 gap-px overflow-hidden rounded-[18px] border border-border bg-border sm:grid-cols-3"
      >
        {#each FACTS as [title, text] (title)}
          <li class="bg-background px-6 py-6">
            <p
              class="text-[clamp(1.05rem,1.8vw,1.25rem)] font-semibold tracking-[-0.02em]"
            >
              {title}
            </p>
            <p
              class="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground"
            >
              {text}
            </p>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <!-- ═══ Навіщо ми взагалі з'явились ═══ -->
  <section
    class="px-[clamp(20px,5vw,56px)] py-[clamp(48px,6vw,80px)]"
    aria-labelledby="about-why"
  >
    <div class="mx-auto max-w-[1120px]">
      <header class="max-w-[42rem]">
        {@render eyebrow('Чому ми взялися')}
        <h2
          id="about-why"
          class="text-[clamp(1.7rem,3.2vw,2.4rem)] leading-[1.08] font-semibold tracking-[-0.03em] text-balance"
        >
          Пошук клінера досі влаштований так, ніби це ваша робота
        </h2>
        <p
          class="mt-4 text-[15.5px] leading-relaxed text-pretty text-muted-foreground"
        >
          Відкрити дошку оголошень, перебрати анкети без облич, обдзвонити
          п’ятьох, кожному переказати те саме, дізнатися ціну вже на порозі. Ми
          вирішили, що описувати завдання людина має один раз — і на цьому її
          участь у пошуку закінчується.
        </p>
      </header>

      <div class="mt-[clamp(28px,3.5vw,44px)] grid gap-4 md:grid-cols-2">
        <!-- Ліва картка навмисно приглушена: це те, від чого йдемо. -->
        <div class="rounded-[20px] border border-border bg-muted/25 p-7">
          <p
            class="text-[13px] font-semibold tracking-[-0.01em] text-muted-foreground"
          >
            Як це зазвичай
          </p>
          <ul class="mt-5 flex flex-col gap-3.5">
            {#each USUAL as item (item)}
              <li
                class="flex items-start gap-3 text-[15px] leading-relaxed text-muted-foreground"
              >
                <X
                  size={17}
                  strokeWidth={2.5}
                  aria-hidden="true"
                  class="mt-0.5 shrink-0 opacity-60"
                />
                {item}
              </li>
            {/each}
          </ul>
        </div>

        <div class="rounded-[20px] border border-border bg-card p-7">
          <p class="text-[13px] font-semibold tracking-[-0.01em]">Як у Zunor</p>
          <ul class="mt-5 flex flex-col gap-3.5">
            {#each OURS as item (item)}
              <li class="flex items-start gap-3 text-[15px] leading-relaxed">
                <!-- Галочка бере той самий акцент, що й плашка «AI» на
                     головній: у нас має бути один синій на весь лендінг,
                     а не по відтінку на секцію. -->
                <Check
                  size={17}
                  strokeWidth={2.5}
                  aria-hidden="true"
                  class="mt-0.5 shrink-0 text-(--about-accent)"
                />
                {item}
              </li>
            {/each}
          </ul>
        </div>
      </div>
    </div>
  </section>

  <!-- ═══ П'ять принципів ═══
       Нумерований список, а не сітка карток: п'ять елементів у три
       колонки лишають дірку в останньому ряду, а редакційний список
       читається зверху вниз саме так, як ці пункти й задумані. -->
  <section
    class="px-[clamp(20px,5vw,56px)] py-[clamp(48px,6vw,80px)]"
    aria-labelledby="about-principles"
  >
    <div class="mx-auto max-w-[1120px]">
      <header class="max-w-[42rem]">
        {@render eyebrow('У що ми віримо')}
        <h2
          id="about-principles"
          class="text-[clamp(1.7rem,3.2vw,2.4rem)] leading-[1.08] font-semibold tracking-[-0.03em] text-balance"
        >
          П’ять рішень, на яких тримається сервіс
        </h2>
        <p
          class="mt-4 text-[15.5px] leading-relaxed text-pretty text-muted-foreground"
        >
          Це не гасла для сторінки — це те, за чим ми звіряємо кожну зміну в
          продукті. Якщо нова функція суперечить хоч одному пункту, ми її не
          робимо.
        </p>
      </header>

      <ol class="mt-[clamp(28px,3.5vw,44px)]">
        {#each PRINCIPLES as principle, i (principle.title)}
          <li
            class="grid gap-3 border-t border-border py-8 last:border-b md:grid-cols-[16rem_1fr] md:gap-10"
          >
            <div class="flex items-baseline gap-4">
              <span
                class="font-mono text-[13px] tracking-[0.08em] text-(--about-accent) tabular-nums"
                aria-hidden="true"
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3
                class="text-[1.0625rem] leading-snug font-semibold tracking-[-0.02em] text-balance"
              >
                {principle.title}
              </h3>
            </div>
            <p
              class="max-w-[46rem] text-[15px] leading-[1.65] text-pretty text-muted-foreground"
            >
              {principle.text}
            </p>
          </li>
        {/each}
      </ol>
    </div>
  </section>

  <!-- ═══ Обіцянки, які вже працюють ═══ -->
  <section
    class="bg-secondary/30 px-[clamp(20px,5vw,56px)] py-[clamp(48px,6vw,80px)]"
    aria-labelledby="about-promises"
  >
    <div class="mx-auto max-w-[1120px]">
      <header class="max-w-[42rem]">
        {@render eyebrow('Наші правила')}
        <h2
          id="about-promises"
          class="text-[clamp(1.7rem,3.2vw,2.4rem)] leading-[1.08] font-semibold tracking-[-0.03em] text-balance"
        >
          Що ми обіцяємо — і вже виконуємо
        </h2>
        <p
          class="mt-4 text-[15.5px] leading-relaxed text-pretty text-muted-foreground"
        >
          Кожен пункт нижче працює просто зараз. Обіцянок «колись зробимо» тут
          навмисно немає.
        </p>
      </header>

      <ul
        class="mt-[clamp(28px,3.5vw,44px)] grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {#each PROMISES as promise (promise.title)}
          <li class="rounded-[18px] border border-border bg-background p-6">
            <span
              class="mb-4 grid size-9 place-items-center rounded-full bg-(--about-accent) text-white"
              aria-hidden="true"
            >
              <Check size={17} strokeWidth={2.75} />
            </span>
            <h3
              class="text-[1rem] leading-snug font-semibold tracking-[-0.02em] text-balance"
            >
              {promise.title}
            </h3>
            <p
              class="mt-2 text-[14.5px] leading-[1.6] text-pretty text-muted-foreground"
            >
              {promise.text}
            </p>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <!-- ═══ Чесно про стадію ═══
       Прямо сказати «нас поки мало» вигідніше, ніж дати людині
       здогадатися самій: питання «а чому тут так порожньо» виникне
       все одно, краще відповісти на нього першими. -->
  <section
    class="px-[clamp(20px,5vw,56px)] py-[clamp(48px,6vw,80px)]"
    aria-labelledby="about-stage"
  >
    <div
      class="mx-auto grid max-w-[1120px] gap-8 md:grid-cols-[1fr_1fr] md:gap-16"
    >
      <header>
        {@render eyebrow('Де ми зараз')}
        <h2
          id="about-stage"
          class="text-[clamp(1.7rem,3.2vw,2.4rem)] leading-[1.08] font-semibold tracking-[-0.03em] text-balance"
        >
          Ми щойно почали — і не приховуємо цього
        </h2>
      </header>

      <div class="flex flex-col gap-4 text-[15.5px] leading-[1.7] text-pretty">
        <p class="text-muted-foreground">
          Zunor запрацював в Одесі зовсім недавно. Клінерів поки небагато — зате
          ми знаємо кожного особисто й переглядаємо кожну анкету вручну. Це
          мінус, який поки що працює як плюс: за якість тут відповідає не
          алгоритм модерації, а конкретні люди.
        </p>
        <p class="text-muted-foreground">
          Прибирання — перша категорія, а не остання. Але поки воно не працює на
          десять із десяти в одному місті, ми не підемо ні в інші послуги, ні в
          інші міста. Спочатку — зробити добре тут.
        </p>
        <p>
          Якщо щось у сервісі здалося вам незручним або дивним — напишіть нам.
          Зараз саме той момент, коли одна ваша репліка справді змінює продукт.
        </p>
        <a
          href="mailto:hello@zunor.com"
          class="w-fit rounded-sm border-b-[1.5px] border-foreground pb-0.5 font-semibold tracking-[-0.01em] transition-colors hover:border-muted-foreground hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          hello@zunor.com
        </a>
      </div>
    </div>
  </section>

  <!-- ═══ Дія ═══
       Дві кнопки, бо в сторінки дві аудиторії, і на «про нас» вони
       обидві доречні: людина або замовляє, або приходить працювати. -->
  <section class="px-[clamp(20px,5vw,56px)] pb-[clamp(56px,7vw,96px)]">
    <div
      class="mx-auto max-w-[1120px] rounded-[28px] bg-foreground px-6 py-[clamp(44px,6vw,80px)] text-center text-background sm:px-16"
    >
      <h2
        class="mx-auto max-w-[20ch] text-[clamp(1.7rem,3.6vw,2.75rem)] leading-[1.06] font-bold tracking-[-0.035em] text-balance"
      >
        Опишіть завдання — далі ми самі
      </h2>
      <p
        class="mx-auto mt-4 max-w-[34rem] text-[clamp(0.95rem,1.6vw,1.0625rem)] leading-[1.6] text-pretty text-background/65"
      >
        Одне речення своїми словами — і вільні клінери Одеси відгукнуться з
        ціною та часом.
      </p>

      <div class="mt-9 flex flex-wrap items-center justify-center gap-3">
        <a
          href="/user/login?redirectTo=%2Fdashboard%2Fjobs%2Fnew"
          class="about-cta inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-background px-8 text-base font-semibold tracking-[-0.01em] text-foreground transition-opacity hover:opacity-90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-background/60"
        >
          Замовити прибирання
          <ArrowRight
            size={18}
            strokeWidth={2.2}
            aria-hidden="true"
            class="about-cta-arrow"
          />
        </a>
        <a
          href="/master/about"
          class="inline-flex h-13 items-center justify-center rounded-xl border border-background/30 px-8 text-base font-semibold tracking-[-0.01em] text-background transition-colors hover:bg-background/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-background/60"
        >
          Стати майстром
        </a>
      </div>
    </div>
  </section>
</main>

<style>
  /* Єдиний кольоровий акцент сторінки — той самий синій, що плашка «AI»
     на головній. Не з токенів теми навмисно: --primary теракотовий і на
     ньому тримається решта застосунку, а тут потрібен контраст до
     нього. Одна змінна на всі три місця (галочки, номери принципів,
     кружки обіцянок) — щоб вони не розійшлися по відтінках при
     наступній правці. */
  .about {
    --about-accent: #2563eb;
  }

  /* Стрілка їде вперед на hover: мікрорух, який каже «це перехід».
     Той самий жест, що в кнопці на головній. */
  .about-cta :global(.about-cta-arrow) {
    transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .about-cta:hover :global(.about-cta-arrow) {
    transform: translateX(3px);
  }

  @media (prefers-reduced-motion: reduce) {
    .about-cta :global(.about-cta-arrow) {
      transition: none;
    }

    .about-cta:hover :global(.about-cta-arrow) {
      transform: none;
    }
  }
</style>
