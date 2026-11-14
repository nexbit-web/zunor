<!--
  Заявка — однаково для клієнта й майстра, за зразком сторінки вакансії
  work.ua: усе головне видно до першої прокрутки, далі — подробиці.

    1. смуга дій: головна кнопка (`actions`) і меню ⋮ (`menu`) — їх дає
       сторінка; без головної кнопки меню стає праворуч у рядок нижче;
    2. «Заявка №… · Опубліковано … · N переглядів» і плашки (стан,
       «Терміново»);
    3. велика назва, праворуч — іконка послуги (як логотип компанії);
    4. факти з сірими іконками: замовник, де, коли, що, обсяг, бюджет,
       телефон — головне, з дрібним поясненням під рядком;
    5. «Про заявку» — опис і фото: що саме зробити, клієнт пише там;
    6. «Деталі» — решта характеристик сіткою плиток (іконка, підпис,
       значення), як характеристики в картці товару; предмети хімчистки —
       сірими чипами. Галочок тут немає навмисно: «2 вікна» чи «перший
       поверх» — це обставини, а не пункти, які треба виконати.

  Під цим сторінка кладе своє: майстрові — картку пропозиції, клієнтові —
  пропозиції майстрів. Обгортку-картку теж малює сторінка.
-->
<script lang="ts">
  import type { Component, Snippet } from 'svelte'
  import type { IconProps } from '$lib/components/icons/stroke-icon.svelte'
  import Calendar from '$lib/components/icons/set/calendar.svelte'
  import MapPin from '$lib/components/icons/set/map-pin.svelte'
  import Flame from '$lib/components/icons/set/flame.svelte'
  import Phone from '$lib/components/icons/set/phone.svelte'
  import Timer from '$lib/components/icons/set/timer.svelte'
  import Wallet from '$lib/components/icons/set/wallet.svelte'
  import User from '$lib/components/icons/set/user.svelte'
  import Star from '$lib/components/icons/set/star.svelte'
  import ServiceIcon from '$lib/categories/cleaning/service-icon.svelte'
  import { serviceLabel, resolveWhen } from '$lib/categories/cleaning/presets'
  import { describeJob } from '$lib/categories/cleaning/describe'
  import { detailIcon } from '$lib/categories/cleaning/detail-icons'
  import { EFFORT_LABELS, effortTier } from '$lib/categories/effort'
  import { formatDistance } from '$lib/geo/districts'
  import { formatDay, formatFull } from '$lib/utils/time'
  import { pluralUk } from '$lib/utils/plural'
  import PhotoGallery from '$lib/components/photo-gallery.svelte'
  import {
    expiresIn,
    formatMoney,
    formatRelative,
    memberSince,
  } from './display'

  type Job = {
    /** Номер для людей (Job.number) — за ним підтримка знаходить заявку. */
    number?: number
    title: string
    description: string | null
    status: string
    metadata: unknown
    attachments: string[]
    city: string
    place: { district: string | null; distanceKm: number | null }
    viewsCount: number
    createdAt: string
    expiresAt: string
    /** Клієнт змінював заявку — майстрові варто знати, що умови нові. */
    editedAt?: string | null
    effort: number | null
    budgetMinCents: number | null
    budgetMaxCents: number | null
    currency: string
  }

  type Client = {
    id: string
    name: string | null
    avgRating: number
    reviewsCount: number
    createdAt: string
  }

  let {
    job,
    status,
    actions,
    menu,
    client,
    viewer = 'client',
  }: {
    job: Job
    /** Плашка стану — перша в рядку над назвою. */
    status: Snippet
    /**
     * Головна дія вгорі ліворуч («Подати пропозицію»). Немає її — не
     * передавай зовсім: інакше лишиться порожня смуга.
     */
    actions?: Snippet
    /** Меню ⋮ праворуч: рідкісні дії (скасувати, посилання). */
    menu?: Snippet
    /** Замовник — лише майстрові: власник і так знає, чия заявка. */
    client?: Client
    viewer?: 'client' | 'master'
  } = $props()

  const meta = $derived<Record<string, unknown>>(
    job.metadata && typeof job.metadata === 'object'
      ? (job.metadata as Record<string, unknown>)
      : {},
  )
  const serviceName = $derived(
    typeof meta.service === 'string' ? serviceLabel(meta.service) : '',
  )

  // День прибирання — через resolveWhen: «today»/«tomorrow» відносні до
  // дня СТВОРЕННЯ заявки, показані як є, вони тиждень брехали «Завтра».
  const day = $derived.by(() => {
    const iso = resolveWhen(meta.when, job.createdAt)
    return iso ? formatDay(iso) : ''
  })

  // «Гаряча» з work.ua — у нас «Терміново»: прибрати треба сьогодні чи
  // завтра, а заявка ще шукає майстра.
  const urgent = $derived(
    job.status === 'OPEN' && (day === 'Сьогодні' || day === 'Завтра'),
  )

  const details = $derived(describeJob(job.metadata, job.createdAt))
  const valueOf = (label: string) =>
    details.find((d) => d.label === label)?.value ?? ''

  // Під назвою послуги — що саме за помешкання: «Квартира · 2 кімнати ·
  // ≈ 55 м²». Ці три поля в списку нижче вже не повторюємо.
  const IN_FACTS = new Set([
    'Послуга',
    'Коли',
    'Помешкання',
    'Кімнат',
    'Площа',
    'Періодичність',
  ])
  const serviceSub = $derived(
    [valueOf('Помешкання'), valueOf('Кімнат'), valueOf('Площа')]
      .filter(Boolean)
      .join(' · '),
  )
  const specs = $derived(
    details.filter((d) => !IN_FACTS.has(d.label) && !d.items && d.value),
  )
  const items = $derived(details.find((d) => d.items)?.items ?? [])

  const place = $derived(
    [job.city, job.place.district].filter(Boolean).join(', '),
  )
  // Як «2,7 км від центру» у work.ua: майстрові — відстань від його
  // району. Адреса — лише район: точну клієнт дає після угоди.
  const placeSub = $derived.by(() => {
    const km = job.place.distanceKm
    if (viewer !== 'master') return ''
    const far = km !== null ? `${formatDistance(km)} від вас · ` : ''
    return `${far}точну адресу — після угоди`
  })

  const effortLabel = $derived(
    job.effort ? `${EFFORT_LABELS[effortTier(job.effort)]} прибирання` : '',
  )

  const budget = $derived.by(() => {
    const { budgetMinCents: min, budgetMaxCents: max, currency } = job
    if (min && max) {
      return min === max
        ? formatMoney(min, currency)
        : `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`
    }
    if (max) return `до ${formatMoney(max, currency)}`
    if (min) return `від ${formatMoney(min, currency)}`
    return ''
  })

  // Відкрита, але вже прострочена заявка (крон ще не закрив) — без «ще
  // Прострочено»: про строк тоді просто мовчимо.
  const published = $derived.by(() => {
    const parts = [
      // Номер — першим: його диктують підтримці.
      ...(job.number ? [`Заявка №${job.number}`] : []),
      `Опубліковано ${formatRelative(job.createdAt)}`,
      ...(job.editedAt ? [`змінено ${formatRelative(job.editedAt)}`] : []),
      `${job.viewsCount} ${pluralUk(job.viewsCount, 'перегляд', 'перегляди', 'переглядів')}`,
    ]
    if (
      job.status === 'OPEN' &&
      new Date(job.expiresAt).getTime() > Date.now()
    ) {
      parts.push(`активна ще ${expiresIn(job.expiresAt)}`)
    }
    return parts.join(' · ')
  })
</script>

<!-- Рядок факту: сіра іконка, головне звичайним кеглем, пояснення —
     дрібним сірим під ним. -->
{#snippet fact(Icon: Component<IconProps>, main: string, sub?: string)}
  <li class="flex gap-3">
    <Icon
      class="mt-px size-5 shrink-0 text-muted-foreground"
      strokeWidth={1.75}
    />
    <div class="min-w-0">
      <p class="text-[15.5px] leading-snug wrap-break-word text-foreground">
        {main}
      </p>
      {#if sub}
        <p class="mt-1 text-[13.5px] leading-snug text-muted-foreground">
          {sub}
        </p>
      {/if}
    </div>
  </li>
{/snippet}

{#if actions}
  <div class="flex items-center gap-2">
    {@render actions()}
    {#if menu}
      <div class="ms-auto">{@render menu()}</div>
    {/if}
  </div>
{/if}

<!-- Без головної дії меню стоїть у цьому рядку праворуч: окрема смуга
     з однією ⋮ була б порожнім місцем над назвою. -->
<div class={['flex items-center gap-2', actions && 'mt-4']}>
  <p
    class="min-w-0 flex-1 text-[13.5px] text-muted-foreground"
    title={formatFull(job.createdAt)}
  >
    {published}
  </p>
  {#if menu && !actions}
    <div class="-my-2 shrink-0">{@render menu()}</div>
  {/if}
</div>

<div class="mt-3 flex flex-wrap items-center gap-2">
  {@render status()}
  {#if urgent}
    <span
      class="inline-flex h-6 items-center gap-1 rounded-full bg-orange-500/12 px-2.5 text-[12.5px] font-medium text-orange-700 dark:text-orange-400"
    >
      <Flame class="size-3.5" strokeWidth={2} />
      Терміново
    </span>
  {/if}
</div>

<header class="mt-3 flex items-start justify-between gap-4">
  <h1
    class="min-w-0 text-[26px] leading-tight font-semibold tracking-[-0.02em] text-pretty wrap-break-word text-foreground sm:text-[32px]"
  >
    {job.title}
  </h1>
  <span
    class="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground/80 sm:size-14"
    aria-hidden="true"
  >
    <ServiceIcon service={meta.service} class="size-8 sm:size-9" />
  </span>
</header>

<ul class="mt-6 flex flex-col gap-4">
  {#if client}
    <li class="flex gap-3">
      <User
        class="mt-px size-5 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
      />
      <div class="min-w-0">
        <p
          class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15.5px] leading-snug"
        >
          <a
            href="/dashboard/client/{client.id}"
            class="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
          >
            {client.name ?? 'Замовник'}
          </a>
          {#if client.reviewsCount > 0}
            <span
              class="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2 text-[12.5px] text-foreground/80"
            >
              <Star class="size-3 fill-amber-400 text-amber-400" />
              <span class="font-medium tabular-nums">
                {client.avgRating.toFixed(1)}
              </span>
              <span class="text-muted-foreground">({client.reviewsCount})</span>
            </span>
          {/if}
        </p>
        <p class="mt-1 text-[13.5px] leading-snug text-muted-foreground">
          Замовник · на Zunor з {memberSince(client.createdAt)}
        </p>
      </div>
    </li>
  {/if}

  {@render fact(MapPin, place, placeSub)}

  {#if day}
    {@render fact(Calendar, day, valueOf('Періодичність'))}
  {/if}

  {#if serviceName}
    <li class="flex gap-3">
      <span
        class="mt-px flex size-5 shrink-0 items-center justify-center text-muted-foreground"
      >
        <ServiceIcon service={meta.service} class="size-5" />
      </span>
      <div class="min-w-0">
        <p class="text-[15.5px] leading-snug text-foreground">{serviceName}</p>
        {#if serviceSub}
          <p class="mt-1 text-[13.5px] leading-snug text-muted-foreground">
            {serviceSub}
          </p>
        {/if}
      </div>
    </li>
  {/if}

  {#if effortLabel}
    {@render fact(
      Timer,
      effortLabel,
      'Оцінка обсягу роботи за деталями заявки',
    )}
  {/if}

  {#if budget}
    {@render fact(Wallet, budget, 'Бюджет клієнта')}
  {/if}

  {#if viewer === 'master'}
    <!-- Як «Показати телефон» у work.ua, але чесно: телефон з'являється
         лише після вибору майстра (захист контактів до угоди). -->
    {@render fact(
      Phone,
      'Телефон клієнта',
      'Відкриється, щойно клієнт обере вас',
    )}
  {/if}
</ul>

{#if job.description || job.attachments.length > 0}
  <section class="mt-7 border-t border-border pt-7">
    <h2 class="text-xl font-semibold tracking-[-0.01em]">Про заявку</h2>
    {#if job.description}
      <!-- pre-line: абзаци з опису лишаються абзацами. -->
      <p
        class="mt-3 text-[15.5px] leading-relaxed whitespace-pre-line text-pretty wrap-break-word text-foreground"
      >
        {job.description}
      </p>
    {/if}
    <PhotoGallery
      images={job.attachments}
      gridClass="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4"
    />
  </section>
{/if}

{#if specs.length > 0 || items.length > 0}
  <section class="mt-8">
    <h2 class="text-xl font-semibold tracking-[-0.01em]">Деталі</h2>

    {#if specs.length > 0}
      <!-- Плитки, а не список: підпис дрібним над значенням читається
           як характеристика, а дві колонки не розтягують сторінку. -->
      <ul class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {#each specs as d (d.label)}
          {@const Icon = detailIcon(d.icon)}
          <li class="flex min-w-0 gap-2.5 rounded-xl bg-muted/60 px-3 py-2.5">
            {#if Icon}
              <Icon
                class="mt-0.5 size-[18px] shrink-0 text-muted-foreground"
                strokeWidth={1.75}
              />
            {/if}
            <span class="min-w-0">
              <span
                class="block text-[12.5px] leading-tight text-muted-foreground"
              >
                {d.label}
              </span>
              <span
                class="mt-1 block text-[14.5px] leading-snug font-medium wrap-break-word text-foreground"
              >
                {d.value}
              </span>
            </span>
          </li>
        {/each}
      </ul>
    {/if}

    {#if items.length > 0}
      <!-- Предмети хімчистки — сірими чипами, як навички у вакансії. -->
      <ul class="mt-4 flex flex-wrap gap-2">
        {#each items as it, i (i)}
          <li
            class="inline-flex h-9 items-center rounded-full bg-muted px-3.5 text-[14px] text-foreground"
          >
            {it.name}
            {#if it.qty > 1}
              <span class="ms-1.5 tabular-nums text-muted-foreground">
                × {it.qty}
              </span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}
