<!--
  Картка заявки — і в «Моїх заявках» клієнта, і в стрічці майстра.

  Подача — як картка вакансії на work.ua: велика назва, під нею факти
  рядками з сірими іконками (бюджет жирним, послуга й день, замовник із
  рейтингом, район і відстань, характеристики через крапку), опис сірим
  на два рядки, а внизу — коли опубліковано й стан (клієнтові). Око
  йде зверху вниз по однакових рядках і порівнює дві заявки одним
  поглядом: гроші, що, хто, де.

  Опис обрізаний: повністю він — на сторінці заявки, а в стрічці два
  рядки показують, про що вона, і не роблять із кожної картки стіну
  тексту. Характеристики — з тих самих полів, що й на сторінці заявки
  (describeJob → jobTags), без послуги й дня: вони вже у своєму рядку.

  Кількості пропозицій майстрові тут немає навмисно (MANIFESTO,
  «Справедливий маркетплейс»): «вже 50+», як в Upwork, відлякувало б
  новачків.

  «Топ для тебе» (match) — заявка, яку розсилка дала б майстрові першою
  хвилею: поруч, під його формат роботи, з авто, якщо треба вивезти.
  Рішення — у мозку підбору (dispatch/core/fit.ts), картка лише малює,
  як брендована вакансія на work.ua: сама картка лишається білою, а
  лежить на бірюзовій підкладці з градієнтом (як картки Perplexity), і
  з-під неї видно смугу «Топ для тебе · Поруч з тобою · …» — не лише
  «що», а й «чому». Тонувати саму картку не треба: тоді вона ставала
  чужою в стрічці.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import Sparkles from '$lib/components/icons/set/sparkles.svelte'
  import Wallet from '$lib/components/icons/set/wallet.svelte'
  import MapPin from '$lib/components/icons/set/map-pin.svelte'
  import User from '$lib/components/icons/set/user.svelte'
  import Star from '$lib/components/icons/set/star.svelte'
  import FileText from '$lib/components/icons/set/file-text.svelte'
  import ServiceIcon from '$lib/categories/cleaning/service-icon.svelte'
  import { serviceLabel, resolveWhen } from '$lib/categories/cleaning/presets'
  import { formatDistance } from '$lib/geo/districts'
  import { formatDay, formatRelative } from '$lib/utils/time'
  import { fitReasonLabels, formatMoney, jobTags } from './display'

  interface Props {
    href: string
    title: string
    description?: string | null
    metadata: unknown
    createdAt: string
    budgetMinCents?: number | null
    budgetMaxCents?: number | null
    currency?: string | null
    /** Скасовані й прострочені — пригашені: це вже історія. */
    dimmed?: boolean
    /** Свіжа (майстрові): «Опубліковано» кольором і з вогником. */
    fresh?: boolean
    /** «Топ для тебе» (майстрові): причини з мозку підбору. */
    match?: readonly string[] | null
    /** Замовник (майстрові): хто й як його оцінили інші майстри. */
    client?: {
      name: string | null
      avgRating: number
      reviewsCount: number
    } | null
    /**
     * Район заявки (майстрові) і відстань від району самого майстра.
     * Район, а не адреса: точну адресу клієнт дає вже після угоди.
     */
    place?: { district: string | null; distanceKm: number | null } | null
    /** Праворуч унизу: стан заявки (клієнтові). */
    aside?: Snippet
  }

  let {
    href,
    title,
    description = '',
    metadata,
    createdAt,
    budgetMinCents = null,
    budgetMaxCents = null,
    currency = 'UAH',
    dimmed = false,
    fresh = false,
    match = null,
    client = null,
    place = null,
    aside,
  }: Props = $props()

  const meta = $derived(
    (metadata && typeof metadata === 'object' ? metadata : {}) as Record<
      string,
      unknown
    >,
  )

  const service = $derived(meta.service)
  const label = $derived(
    typeof service === 'string' ? serviceLabel(service) : 'Прибирання',
  )

  /** День прибирання з урахуванням «today/tomorrow» від дня створення. */
  const day = $derived.by(() => {
    const iso = resolveWhen(meta.when, createdAt)
    return iso ? formatDay(iso) : ''
  })

  const budget = $derived.by(() => {
    const cur = currency ?? 'UAH'
    if (budgetMinCents && budgetMaxCents) {
      return budgetMinCents === budgetMaxCents
        ? formatMoney(budgetMinCents, cur)
        : `${formatMoney(budgetMinCents, cur)} – ${formatMoney(budgetMaxCents, cur)}`
    }
    if (budgetMaxCents) return `до ${formatMoney(budgetMaxCents, cur)}`
    if (budgetMinCents) return `від ${formatMoney(budgetMinCents, cur)}`
    return ''
  })

  const where = $derived.by(() => {
    if (!place?.district) return ''
    return place.distanceKm !== null
      ? `${place.district} · ${formatDistance(place.distanceKm)}`
      : place.district
  })

  const reasons = $derived(match ? fitReasonLabels(match) : [])

  const tags = $derived(jobTags(metadata, createdAt))

  // Рядок факту: сіра іконка 18px, текст поруч.
  const ROW = 'flex min-w-0 items-start gap-2.5'
  const ICON = 'mt-0.5 size-[18px] shrink-0 text-muted-foreground'
</script>

<li>
  <!-- Посилання — уся обгортка: і картка, і смуга під нею. -->
  <a
    {href}
    class={[
      'group block rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
      match && 'match-wrap',
    ]}
  >
    <div
      class={[
        // Ховер непрозорий: напівпрозорий пропускав би підкладку «Топ».
        'rounded-2xl border border-border bg-card px-5 py-4.5 transition-colors group-hover:bg-[color-mix(in_srgb,var(--muted)_40%,var(--card))] sm:px-6 sm:py-5',
        match && 'match-card',
      ]}
    >
      <div class={['min-w-0', dimmed && 'opacity-60']}>
        <h3
          class="text-[19px] leading-snug font-semibold tracking-[-0.01em] text-pretty text-foreground sm:text-xl"
        >
          {title}
        </h3>

        <ul class="mt-2.5 flex flex-col gap-1.5 text-[14.5px] leading-snug">
          {#if budget}
            <li class={ROW}>
              <Wallet class={ICON} strokeWidth={1.75} />
              <span class="font-semibold text-foreground tabular-nums">
                {budget}
              </span>
            </li>
          {/if}

          <li class={ROW}>
            <span class="mt-0.5 flex size-[18px] shrink-0 items-center justify-center">
              <ServiceIcon {service} class="size-[18px] text-muted-foreground" />
            </span>
            <span class="min-w-0 text-foreground">
              {label}{#if day}<span class="text-muted-foreground">{' · '}{day}</span>{/if}
            </span>
          </li>

          {#if client}
            <li class={ROW}>
              <User class={ICON} strokeWidth={1.75} />
              <span class="flex min-w-0 items-center gap-1.5">
                <span class="truncate font-medium text-foreground">
                  {client.name ?? 'Замовник'}
                </span>
                {#if client.reviewsCount > 0}
                  <Star class="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
                  <span class="font-medium text-foreground/80 tabular-nums">
                    {client.avgRating.toFixed(1)}
                  </span>
                {/if}
              </span>
            </li>
          {/if}

          {#if where}
            <li class={ROW}>
              <MapPin class={ICON} strokeWidth={1.75} />
              <span class="min-w-0 text-foreground">{where}</span>
            </li>
          {/if}

          {#if tags.length > 0}
            <li class={ROW}>
              <FileText class={ICON} strokeWidth={1.75} />
              <span class="min-w-0 text-foreground">{tags.join(' · ')}</span>
            </li>
          {/if}
        </ul>

        {#if description}
          <p
            class="mt-3 line-clamp-2 text-[14.5px] leading-relaxed text-pretty text-muted-foreground"
          >
            {description}
          </p>
        {/if}

        <div class="mt-3.5 flex items-center justify-between gap-4">
          <p
            class={[
              'flex items-center gap-1.5 text-[13.5px]',
              fresh ? 'font-medium text-primary' : 'text-muted-foreground',
            ]}
          >
            <!-- Вогник — лише на свіжій: на неї ще реально встигнути, і
                 саме це майстер шукає очима. Якби дихало все, не казало б
                 нічого. -->
            {#if fresh}
              <span class="live-dot size-1.5 rounded-full bg-primary"></span>
            {/if}
            {formatRelative(createdAt)}
          </p>

          {#if aside}
            <span class="shrink-0">{@render aside()}</span>
          {/if}
        </div>
      </div>
    </div>

    {#if match}
      <!-- Смуга з-під картки: чому заявка саме для тебе. -->
      <p
        class="match-strip flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-5 py-2.5 text-center text-[13.5px]"
      >
        <span class="inline-flex items-center gap-1.5 font-semibold">
          <Sparkles class="size-4" strokeWidth={1.75} />
          Топ для тебе
        </span>
        {#each reasons as reason (reason)}
          <span aria-hidden="true" class="opacity-50">·</span>
          <span>{reason}</span>
        {/each}
      </p>
    {/if}
  </a>
</li>

<style>
  /* «Топ для тебе»: бірюзова підкладка Perplexity (#016a71) зі світлою
     плямою #339196 — та сама, що на їхній картці «Шукайте будь-що».
     Пляма праворуч ВНИЗУ, а не вгорі, як у них: верх підкладки закриває
     картка, і відблиск сховався б під нею. Колір сталий, не від акценту
     (акцентом уже позначено свіжість і дії), однаковий в обох темах.
     Тінь картки відриває її від підкладки, як на work.ua. */
  .match-wrap {
    --top-fg: #ffffff;
    background:
      radial-gradient(
        55% 220% at 100% 100%,
        #339196 0%,
        rgb(51 145 150 / 0) 70%
      ),
      linear-gradient(100deg, #016a71 40%, #0b767d 100%);
    /* Бірюза — лише внизу: під смугою й нижніми скругленнями картки
       (6rem вистачає й на смугу у два рядки на телефоні; картка завжди
       вища). Повна підкладка просвічувала тонкими смужками на
       згладжених краях верхніх кутів картки з тим самим радіусом. */
    background-size: 100% 6rem;
    background-position: bottom;
    background-repeat: no-repeat;
  }
  .match-strip {
    color: var(--top-fg);
  }
  .match-card {
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.07);
  }

  .live-dot {
    animation: live-pulse 2s ease-in-out infinite;
  }
  @keyframes live-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .live-dot {
      animation: none;
    }
  }
</style>
