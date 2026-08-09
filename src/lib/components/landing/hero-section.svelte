<script lang="ts">
  // Головний екран лендінгу: ліворуч — обіцянка й дія, праворуч — сам
  // продукт. Секція затягнута ПІД шапку (-mt-14), бо шапка прозора, поки
  // сторінку не проскролили.
  //
  // Ліва колонка відповідає на заперечення по порядку:
  //   бейдж       → привід спробувати саме зараз;
  //   заголовок   → хто ми: не каталог, а AI-асистент;
  //   два пункти  → чому це швидше за каталог. Саме ДВА: третій рядок
  //                 читається вже як список переваг, а не як аргумент;
  //   кнопка      → одна. Дві однаково великі кнопки ділять увагу, і
  //                 людина обирає між ними замість того, щоб діяти;
  //   гарантія    → що буде, якщо прибрали погано.
  //
  // Права колонка — не картинка, а сам інтерфейс: дві репліки діалогу як
  // ілюстрація і СПРАВЖНЄ поле вводу під ними. Текст із нього доїжджає в
  // чат, тобто перший дотик до продукту відбувається просто тут.
  //
  // Блок навмисно без кольору: фон — звичайний --background, кнопка
  // чорно-біла, галочки нейтральні. Акцент тут не потрібен — його роль
  // виконує сам розмір заголовка.
  //
  // Чого свідомо НЕМАЄ:
  //   • обіцянки, що ціну назве AI — її називає МАЙСТЕР (маніфест, р. 5);
  //   • вигаданих цифр у ролі доказу («500+ клієнтів») — сервіс на старті;
  //   • неактивних кнопок: disabled-контрол у головному CTA читається як
  //     «тут половина не працює».
  //
  // ⚠️ BADGE і GUARANTEE — комерційні обіцянки, а не факти з коду. Вони
  // мусять існувати насправді (знижка діє, перемивання роблять), інакше
  // перший же клієнт зловить нас на слові.

  // Точкові імпорти, а не barrel 'lucide-svelte': бочка реекспортує
  // ~1700 .svelte-іконок, і цей блок — головний екран, тобто чанк, який
  // тягнеться першим на кожен вхід. Так само зроблено в шапці.
  import ArrowUp from '@lucide/svelte/icons/arrow-up'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import Check from '@lucide/svelte/icons/check'
  import MapPin from '@lucide/svelte/icons/map-pin'
  import Copy from '@lucide/svelte/icons/copy'
  import ThumbsUp from '@lucide/svelte/icons/thumbs-up'
  import ThumbsDown from '@lucide/svelte/icons/thumbs-down'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import Plus from '@lucide/svelte/icons/plus'
  import Mic from '@lucide/svelte/icons/mic'
  import { goto } from '$app/navigation'
  import { Button } from '$lib/components/ui/button'
  import * as Tooltip from '$lib/components/ui/tooltip'

  // Ряд дій під відповіддю асистента. label використовується як ключ
  // {#each} і більше ніде: іконки самі по собі неунікальні як ключ.
  const MESSAGE_ACTIONS = [
    { label: 'copy', icon: Copy },
    { label: 'like', icon: ThumbsUp },
    { label: 'dislike', icon: ThumbsDown },
    { label: 'retry', icon: RotateCcw },
  ] as const

  const BULLETS = [
    'Без анкет — опишіть завдання своїми словами',
    'Вільні клінери поруч відгукуються самі: з ціною та часом',
  ] as const

  // ─── Друкований плейсхолдер ───
  const PHRASE_PREFIX = 'Треба '
  const PHRASES = [
    'прибрати квартиру...',
    'помити вікна...',
    'хімчистка дивана...',
    'генеральне прибирання...',
    'прибрати після ремонту...',
  ] as const

  const TYPE_MS = 40
  const SPACE_EXTRA_MS = 50
  const HOLD_MS = 1500
  const ERASE_MS = 18
  const GAP_MS = 200
  const TEXTAREA_MAX_PX = 140

  let input = $state('')
  let textareaEl: HTMLTextAreaElement | undefined = $state()
  let placeholder = $state(PHRASE_PREFIX)

  const canSend = $derived(input.trim().length > 0)

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  $effect(() => {
    // Анімований плейсхолдер — декорація. Для prefers-reduced-motion
    // показуємо статичну фразу й нічого не запускаємо.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      placeholder = PHRASE_PREFIX + PHRASES[0]
      return
    }

    // cancelled читається всередині циклів: без нього async-цикл
    // переживе розмонтування компонента й писатиме в мертвий стан.
    let cancelled = false

    async function run() {
      let i = 0
      while (!cancelled) {
        const suffix = PHRASES[i]

        for (let c = 1; c <= suffix.length && !cancelled; c++) {
          placeholder = PHRASE_PREFIX + suffix.slice(0, c)
          // Пауза після пробілу довша — так набір читається як людський.
          const extra = suffix[c - 1] === ' ' ? SPACE_EXTRA_MS : 0
          await sleep(TYPE_MS + Math.random() * 40 + extra)
        }
        if (cancelled) break
        await sleep(HOLD_MS)

        for (let c = suffix.length; c >= 0 && !cancelled; c--) {
          placeholder = PHRASE_PREFIX + suffix.slice(0, c)
          await sleep(ERASE_MS + Math.random() * 12)
        }
        if (cancelled) break
        await sleep(GAP_MS)

        i = (i + 1) % PHRASES.length
      }
    }

    run()
    return () => {
      cancelled = true
    }
  })

  function autoResize(): void {
    if (!textareaEl) return
    textareaEl.style.height = 'auto'
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, TEXTAREA_MAX_PX)}px`
  }

  // Текст гостя доїжджає до чату: jobs/new читає ?q=. redirectTo енкодимо
  // цілком, інакше внутрішній ?q= обріжеться при вході.
  //
  // Порожнє поле кнопку НЕ блокує: гість, який просто тицьнув стрілку,
  // має потрапити в діалог, а не впертись у мертвий контрол.
  function chatHref(q = ''): string {
    const target = q
      ? `/dashboard/jobs/new?q=${encodeURIComponent(q)}`
      : '/dashboard/jobs/new'
    return `/user/login?redirectTo=${encodeURIComponent(target)}`
  }

  function goToChat(): void {
    goto(chatHref(input.trim()))
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      goToChat()
    }
  }
</script>

<section
  class="hero relative -mt-14 flex w-full items-center bg-background px-[clamp(20px,5vw,56px)] pt-24 pb-16 lg:min-h-svh lg:pb-20"
  aria-label="Головний екран"
>
  <div
    class="mx-auto grid w-full max-w-[1180px] items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16"
  >
    <!-- ═══ Ліва колонка: обіцянка й дія ═══ -->
    <div class="flex flex-col items-start text-left">
      <!-- Місто простим рядком, без плашки: воно знімає питання «а ви
           взагалі в моєму місті» і не має конкурувати з H1 за увагу. -->
      <p
        class="hero-in inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
        style="--d: 0ms"
      >
        <MapPin size={15} strokeWidth={2} aria-hidden="true" />
        Одеса, UA
      </p>

      <!-- Заголовок називає дію і одразу спосіб. Це і є вся модель: не
           каталог, у якому шукаєш ти, а асистент, який шукає замість
           тебе. -->
      <h1
        class="hero-in mt-6 max-w-[620px] text-[clamp(2.5rem,4.4vw,4rem)] leading-[1.02] font-bold tracking-[-0.035em] text-balance text-foreground"
        style="--d: 60ms"
      >
        Замовляйте клінінг разом з <span class="hero-ai">AI</span>
      </h1>

      <ul class="hero-in mt-7 flex flex-col gap-3" style="--d: 120ms">
        {#each BULLETS as bullet (bullet)}
          <li class="flex items-start gap-3 text-[1.0625rem] leading-relaxed">
            <!-- Галочка бере той самий --hero-accent, що й плашка «AI»:
                 це знак «так, це входить», і він має читатись як одна
                 система з заголовком, а не як окремий колір. -->
            <Check
              size={18}
              strokeWidth={2.5}
              aria-hidden="true"
              class="mt-1 shrink-0 text-(--hero-accent)"
            />
            <span class="text-foreground/85">{bullet}</span>
          </li>
        {/each}
      </ul>

      <!-- Одна кнопка. variant="default" у нашому ui вже чорно-білий
           (bg-foreground / text-background) і сам інвертується в темній
           темі — власних кольорів тут не задаємо.

           Стрілка їде вперед на hover: мікрорух, який каже «це перехід, а
           не просто клік». -->
      <div class="hero-in mt-8 flex flex-wrap gap-3" style="--d: 180ms">
        <Button
          href={chatHref()}
          class="hero-cta h-13 gap-2 rounded-xl px-8 text-base font-semibold"
        >
          Замовити прибирання
          <ArrowRight class="hero-cta-arrow" aria-hidden="true" />
        </Button>

        <!-- Друга кнопка — для іншої аудиторії (майстрів), тому вона й
             виглядає інакше: тільки рамка й текст. На ховер заливається
             в той самий чорно-білий, що й головна: так видно, що це теж
             кнопка, але черга в неї друга. -->
        <Button
          href="/master/about"
          variant="outline"
          class="hero-alt h-13 rounded-xl border-border bg-transparent px-8 text-base font-semibold text-foreground"
        >
          Стати майстром
        </Button>
      </div>
    </div>

    <!-- ═══ Права колонка: сам продукт ═══
         Дві репліки зверху — ілюстрація діалогу, поле під ними —
         справжнє. Так людина бачить, ЯК це виглядає, і одразу може
         спробувати, не перемикаючи екран.

         Без аватара й без чіпів: у діалозі має бути видно ТІЛЬКИ
         розмову, усе інше відтягує погляд від неї. -->
    <div class="hero-in hero-card flex flex-col gap-6 p-6" style="--d: 300ms">
      <div class="flex flex-col gap-4" aria-hidden="true">
        <p
          class="max-w-[80%] self-end rounded-[18px] rounded-br-md bg-secondary px-4 py-3 text-[0.9375rem] leading-relaxed text-foreground"
        >
          Потрібне генеральне прибирання трикімнатної квартири
        </p>

        <div class="flex flex-col gap-2">
          <p
            class="max-w-[88%] text-[0.9375rem] leading-relaxed text-foreground/85"
          >
            Звісно, зараз оформлю замовлення. Підкажіть день і зручний час — і я
            передам заявку вільним клінерам поруч.
          </p>

          <!-- Ряд дій під відповіддю — впізнаваний жест будь-якого
               AI-чату (копіювати / оцінити / перегенерувати). Він тут не
               заради краси: саме цей ряд одразу каже «це розмова з
               моделлю», а не переписка з оператором у віджеті підтримки.

               Це <span>, а не <button>: увесь діалог — ілюстрація під
               aria-hidden, і живі контроли в ньому були б обіцянкою дії,
               якої немає. Ховер лишаємо, бо без нього ряд читається як
               випадковий набір іконок. -->
          <div class="-ml-1.5 flex items-center gap-0.5">
            {#each MESSAGE_ACTIONS as action (action.label)}
              <span
                class="hero-msg-action grid size-7 place-items-center rounded-lg text-muted-foreground"
              >
                <action.icon size={14} strokeWidth={2} />
              </span>
            {/each}
          </div>
        </div>
      </div>

      <!-- Поле справжнє: текст їде в чат через ?q=. Це головна дія правої
           колонки, тому в неї власні стани, а не набір довгих
           arbitrary-класів у розмітці. -->
      <div
        class="hero-composer flex cursor-text flex-col gap-2.5 px-3.5 pt-3 pb-2.5"
      >
        <textarea
          bind:this={textareaEl}
          bind:value={input}
          oninput={autoResize}
          onkeydown={handleKeydown}
          rows="1"
          {placeholder}
          aria-label="Опишіть, що потрібно прибрати"
          class="min-h-[1.5lh] w-full resize-none bg-transparent text-[0.9375rem] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
        ></textarea>

        <div class="flex items-center justify-between gap-3">
          <!-- «+» — додати фото. Для гостя недоступне навмисно: фото
               помешкання їде в заявку, а заявка існує лише в акаунта.
               Тултип пояснює це ДО кліку — інакше людина тисне й нічого
               не відбувається.

               aria-disabled, а НЕ disabled: справжній disabled-атрибут
               гасить події миші, і тултип на ховер просто не зʼявився б —
               тобто пояснення пропало б разом із можливістю натиснути. -->
          <Tooltip.Provider delayDuration={120}>
            <Tooltip.Root>
              <Tooltip.Trigger
                aria-disabled="true"
                aria-label="Увійдіть, щоб додати фото"
                class="grid size-8 cursor-not-allowed place-items-center rounded-full border border-border text-muted-foreground opacity-60"
              >
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
              </Tooltip.Trigger>
              <Tooltip.Content sideOffset={6}>
                Увійдіть, щоб додати фото
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>

          <span class="flex items-center gap-2.5">
            <span
              class="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground"
            >
              <MapPin size={14} strokeWidth={2} aria-hidden="true" />
              Одеса
            </span>

            <!-- Порожнє поле — мікрофон і неактивна кнопка; є текст —
                 стрілка й активна. Той самий жест, що в будь-якому
                 месенджері: вигляд кнопки САМ каже, що зараз станеться,
                 і підпис для цього не потрібен. -->
            <button
              type="button"
              onclick={goToChat}
              disabled={!canSend}
              aria-label={canSend
                ? 'Надіслати'
                : 'Голосове повідомлення — незабаром'}
              class="hero-send grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:outline-none enabled:cursor-pointer enabled:bg-foreground enabled:text-background enabled:active:scale-95 enabled:hover:opacity-85 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground"
            >
              {#if canSend}
                <ArrowUp size={16} strokeWidth={2.5} aria-hidden="true" />
              {:else}
                <Mic size={16} strokeWidth={2} aria-hidden="true" />
              {/if}
            </button>
          </span>
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  /* Єдиний кольоровий акцент блока: плашка «AI» в заголовку і галочки в
     пунктах. Одна змінна на обидва місця — щоб не вийшло, що плашка
     синя, а галочки лишились від попередньої ітерації зеленими.

     Не з токенів теми навмисно: --primary теракотовий і на ньому вже
     тримається решта застосунку, а тут потрібен контраст до нього. */
  .hero {
    --hero-accent: #2563eb;
    --hero-accent-foreground: #ffffff;
  }

  /* Картка з діалогом. Без тіні свідомо: фон секції плаский, і будь-яка
     тінь на ньому одразу читається як «наліпка». Форму тримає рамка. */
  .hero-card {
    border: 1px solid var(--border);
    border-radius: 22px;
    background: var(--card);
  }

  /* «AI» плашкою з нахилом. Експеримент: у рівному наборі це слово
     губиться серед решти, а нахилена плашка робить його єдиною точкою,
     за яку чіпляється око — і саме воно відрізняє нас від каталогу.

     Колір — через --hero-accent (див. .hero вище). Він же фарбує
     галочки: у блоці має бути ОДИН кольоровий акцент, а не два різні,
     і одна змінна цього не дає забути.

     Значення фіксоване, а не з токенів теми: плашка однакова у світлій
     і темній, тож і текст на ній лишається білим у обох. */
  .hero-ai {
    display: inline-block;
    padding: 0.04em 0.22em;
    border-radius: 0.26em;
    background: var(--hero-accent);
    color: var(--hero-accent-foreground);
    transform: rotate(-2.5deg);
  }

  /* Іконки під відповіддю. Ледь помітні за замовчуванням і проявляються
     під курсором — так само, як у справжніх AI-чатах: ряд не має
     сперечатися з текстом відповіді, доки на нього не дивляться. */
  .hero-msg-action {
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .hero-msg-action:hover {
    background: var(--muted);
    color: var(--foreground);
  }

  /* Поле вводу всередині картки. */
  .hero-composer {
    border: 1px solid var(--border);
    border-radius: 18px;
    background: color-mix(in oklch, var(--muted) 45%, var(--card));
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .hero-composer:focus-within {
    border-color: color-mix(in oklch, var(--foreground) 25%, var(--border));
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--foreground) 8%, transparent);
  }

  /* Стрілка в головній кнопці. Обгортка `.hero :global(...)` обовʼязкова:
     клас їде в Button пропом class, розмітку малює сам компонент, і
     хеша нашої області видимості на його елементах немає — звичайне
     правило Svelte викинув би як невикористане, мовчки. */
  .hero :global(.hero-cta .hero-cta-arrow) {
    transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .hero :global(.hero-cta:hover .hero-cta-arrow) {
    transform: translateX(3px);
  }

  /* Друга кнопка: на ховер заливається кольором тексту й інвертує підпис.
     Через :global з тієї ж причини — розмітку малює сам Button. Колір
     рамки теж змінюємо, інакше на залитому фоні лишається світла обвідка
     і кнопка виглядає обрізаною. */
  .hero :global(.hero-alt) {
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease;
  }

  .hero :global(.hero-alt:hover) {
    background: var(--foreground);
    border-color: var(--foreground);
    color: var(--background);
  }

  /* Стрілка їде вгору на hover — мікрорух, який каже «це відправка».
     :global потрібен, бо <svg> малює компонент lucide, а не наша
     розмітка: хеша області видимості на ньому немає. */
  .hero-send :global(svg) {
    transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* :enabled обовʼязковий — інакше мікрофон у неактивній кнопці теж
     підстрибував би під курсором і обіцяв дію, якої немає. */
  .hero-send:enabled:hover :global(svg) {
    transform: translateY(-2px);
  }

  /* Поява — CSS, а не svelte-transition: так її вимикає
     prefers-reduced-motion (transition цього не вміє) і не витрачається
     кадр JS на кожен елемент у найважливішому блоці сторінки.

     Селектор через `.hero :global(...)`, бо клас hero-in їде і в Button
     теж — розмітку малює сам компонент, хеша нашої області видимості на
     його елементі немає, і звичайне правило Svelte викинув би як
     невикористане, мовчки разом з анімацією. */
  .hero :global(.hero-in) {
    animation: hero-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: var(--d, 0ms);
  }

  @keyframes hero-rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hero :global(.hero-in) {
      animation: none;
    }

    .hero-send :global(svg),
    .hero :global(.hero-cta .hero-cta-arrow) {
      transition: none;
    }

    .hero-send:enabled:hover :global(svg),
    .hero :global(.hero-cta:hover .hero-cta-arrow) {
      transform: none;
    }
  }
</style>
