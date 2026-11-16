<!--
  Профіль майстра: свій — на дашборді, чужий — dashboard/master/[id] (клієнт
  відкриває з пропозиції, замовлення чи чату). Публічної сторінки й
  розмітки для пошуковиків немає: Zunor не каталог, майстра підбирає
  платформа.

  Карток більше немає. Кожен розділ жив у рамці зі скругленням 28px, і
  сторінка читалась як стос віджетів. Тут одна колонка: хто це → що
  робить → як працював → приклади → відгуки. Розділи тримає повітря й
  волосяна лінія, а не рамка.
-->
<script lang="ts">
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import BadgeCheck from '$lib/components/icons/set/badge-check.svelte'
  import Building2 from '$lib/components/icons/set/building-2.svelte'
  import House from '$lib/components/icons/set/house.svelte'
  import Star from '$lib/components/icons/set/star.svelte'
  import User from '$lib/components/icons/set/user.svelte'
  import type { FreelancerProfileData as ProfileData } from '$lib/components/profile/types'
  import PhotoGallery from '$lib/components/photo-gallery.svelte'
  import ServiceIcon from '$lib/categories/cleaning/service-icon.svelte'
  import { getBannerForCategories } from '$lib/categories/registry'
  import { kindLabel, kindOfCrew } from '$lib/masters/meta'

  interface Props {
    user: ProfileData
    isOwner: boolean
    /** Зарезервовано: гейт для CTA «написати майстру», коли зʼявиться чат із профілю. */
    isAuthenticated: boolean
  }
  // * isAuthenticated поки не використовується у в'ю — не деструктуруємо, щоб не плодити warning
  let { user, isOwner }: Props = $props()

  /** Дата у локалі uk-UA. Невалідне значення не роняє рендер. */
  function formatDate(
    value: string | Date,
    opts: Intl.DateTimeFormatOptions,
  ): { display: string; iso: string } {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return { display: '—', iso: '' }
    return {
      display: d.toLocaleDateString('uk-UA', opts),
      iso: d.toISOString(),
    }
  }

  /**
   * «березня 2025» — місяць у родовому відмінку. Місяць із роком Intl
   * віддає в називному («березень 2025 р.»), і «з березень» читалось з
   * помилкою; з днем — у родовому, тож день просто відкидаємо.
   */
  function monthYear(value: string | Date): string {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    const parts = new Intl.DateTimeFormat('uk-UA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).formatToParts(d)
    const part = (type: string) => parts.find((p) => p.type === type)?.value
    return `${part('month')} ${part('year')}`
  }

  /** Рейтинг → рядок. Захист від NaN. */
  function fmtRating(value: number): string {
    return (Number.isFinite(value) ? value : 0).toFixed(1)
  }

  /** Ціле число зірок 0–5. Захист від дробу/відʼємного. */
  function starCount(rating: number): number {
    if (!Number.isFinite(rating)) return 0
    return Math.max(0, Math.min(5, Math.round(rating)))
  }

  /** Українське відмінювання слова «відгук». */
  function reviewsLabel(n: number): string {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return 'відгук'
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100))
      return 'відгуки'
    return 'відгуків'
  }

  // * хто це — людина чи компанія (компанія — crew = COMPANY). Профіль,
  // * старший за питання (crew = null), підпису не має
  const kind = $derived(kindOfCrew(user.crew))
  const isCompany = $derived(kind === 'company')
  const KindIcon = $derived(isCompany ? Building2 : User)

  const since = $derived(monthYear(user.createdAt))
  const services = $derived(user.services ?? [])
  const premises = $derived(user.premises ?? [])
  const hasRating = $derived(user.reviewsCount > 0)
  const banner = $derived(
    user.categorySlugs.length > 0
      ? getBannerForCategories(user.categorySlugs)
      : null,
  )

  let avatarLoaded = $state(false)
  const initials = $derived(
    (user.name ?? '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?',
  )

  // * показуємо ВСІ категорії, а не лише першу. На сьогодні вона одна
  // * («Прибирання»), але додавання другої має бути додаванням контенту, а
  // * не правкою розмітки
  const categoryLabel = $derived(
    user.categories.length > 1 ? 'Категорії' : 'Категорія',
  )
</script>

<article class="mx-auto w-full max-w-150 px-5 pt-10 pb-16">
  <!-- ═══ Банер ═══
       Нижчий за попередній (180px) і без темного градієнта поверх:
       градієнт існував, щоб на картинці читався текст, а тексту на ній
       більше немає. Скруглення — спільні 8px. -->
  {#if banner}
    <!-- AVIF — удвічі легший; браузер без нього бере WebP з <img>. -->
    <div class="h-32 overflow-hidden rounded-[8px] bg-muted sm:h-40">
      <picture class="block size-full">
        {#if banner.avif}
          <source srcset={banner.avif} type="image/avif" />
        {/if}
        <img
          src={banner.src}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
          class="size-full object-cover"
        />
      </picture>
    </div>
  {/if}

  <!-- ═══ Хто це ═══
       Як профіль у Twitter: аватар ліворуч, наполовину на банері, а імʼя
       й підписи — під ним, по лівому краю. По центру шапка займала пів
       екрана, і до суті доводилось гортати. «Редагувати» — праворуч на
       рівні аватара. -->
  <header>
    <div
      class="flex items-end justify-between gap-4 {banner ? '-mt-10' : ''}"
    >
      <div class="relative ml-4 shrink-0">
        {#if user.avatar && !avatarLoaded}
          <div
            class="absolute inset-0 z-10 size-20 overflow-hidden rounded-full ring-4 ring-background"
          >
            <Skeleton class="size-full rounded-full" />
          </div>
        {/if}
        <Avatar class="size-20 ring-4 ring-background">
          {#if user.avatar}
            <AvatarImage
              src={user.avatar}
              alt={isCompany ? `Логотип ${user.name}` : `Аватар ${user.name}`}
              loading="eager"
              fetchpriority="high"
              decoding="async"
              onload={() => (avatarLoaded = true)}
              onerror={() => (avatarLoaded = true)}
            />
          {/if}
          <AvatarFallback
            class="cursor-default bg-muted text-2xl font-medium text-muted-foreground"
          >
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>

      {#if isOwner}
        <a
          href="/dashboard/settings/profile"
          class="inline-flex h-9 shrink-0 items-center rounded-[8px] border border-primary px-4 text-[14px] text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Редагувати профіль
        </a>
      {/if}
    </div>

    <div class="mt-3 flex items-center gap-1.5">
      <h1 class="text-2xl font-semibold [overflow-wrap:anywhere]">
        {user.name}
      </h1>
      {#if user.verificationStatus === 'VERIFIED'}
        <BadgeCheck
          class="size-5 shrink-0 fill-primary stroke-primary-foreground"
          aria-label="Верифікований"
        />
      {/if}
    </div>

    <!-- Хто це — пігулкою кольору акценту: клієнту варто одразу бачити,
         кличе він людину чи клінінгову компанію. Поруч — місто й дата,
         без піктограм: це підпис, а не дані, заради яких потрібні значки. -->
    <div
      class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[15px] text-muted-foreground"
    >
      {#if kind}
        <span
          class="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[12.5px] font-semibold text-primary"
        >
          <KindIcon class="size-3.5 shrink-0" aria-hidden="true" />
          {kindLabel(kind)}
        </span>
      {/if}
      <span>
        {#if user.city}{user.city}{/if}{#if user.city && since}{' · '}{/if}{#if since}на Zunor з {since}{/if}
      </span>
    </div>
  </header>

  <!-- ═══ Як працював ═══
       Значка «Топ виконавець» немає: він вмикався на 50 виконаних
       замовленнях, а саме це число стоїть поруч у цифрах. Без відгуків
       замість рейтингу — «Новий»: «0.0» читається як погана оцінка, а
       прочерк — як збій, хоча насправді оцінок просто ще немає (так
       робить і Airbnb). -->
  <div
    class="mt-8 grid grid-cols-3 divide-x divide-border/60 border-y border-border/60 py-5 text-center"
  >
    <div>
      <div
        class="inline-flex items-center gap-1.5 text-[22px] font-semibold tabular-nums"
      >
        <Star class="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />
        {hasRating ? fmtRating(user.avgRating) : isCompany ? 'Нова' : 'Новий'}
      </div>
      <div class="mt-0.5 text-[13px] text-muted-foreground">
        {hasRating ? 'рейтинг' : 'ще без оцінок'}
      </div>
    </div>
    <div>
      <div class="text-[22px] font-semibold tabular-nums">
        {user.completedOrders ?? 0}
      </div>
      <div class="mt-0.5 text-[13px] text-muted-foreground">виконано</div>
    </div>
    <div>
      <div class="text-[22px] font-semibold tabular-nums">
        {user.reviewsCount}
      </div>
      <div class="mt-0.5 text-[13px] text-muted-foreground">
        {reviewsLabel(user.reviewsCount)}
      </div>
    </div>
  </div>

  <!-- ═══ Що робить ═══ -->
  {#if user.categories.length > 0}
    <section class="mt-8">
      <h2 class="text-[15px] font-semibold">{categoryLabel}</h2>
      <!-- flex-wrap: із кількома категоріями рядок не має виїжджати за
           колонку на вузькому екрані. -->
      <!-- Категорія — тоном акценту, послуги поруч — сірими з іконками
           тими самими, що в заявках: «Прибирання» саме по собі нічого не
           каже, а «Генеральне · Миття вікон» — те, що клієнт і шукає. -->
      <div class="mt-2 flex flex-wrap gap-2">
        {#each user.categories as category (category)}
          <span
            class="inline-flex h-8 items-center rounded-[8px] bg-primary/10 px-3 text-[14px] font-medium text-primary"
          >
            {category}
          </span>
        {/each}
        {#each services as s (s.key)}
          <span
            class="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-muted px-3 text-[14px]"
          >
            <ServiceIcon service={s.key} class="size-4.5 shrink-0" />
            {s.label}
          </span>
        {/each}
      </div>
      {#if premises.length > 0}
        <p
          class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-muted-foreground"
        >
          {#each premises as p (p.key)}
            {@const Icon = p.key === 'business' ? Building2 : House}
            <span class="inline-flex items-center gap-1.5">
              <Icon class="size-4" aria-hidden="true" />
              {p.label}
            </span>
          {/each}
        </p>
      {/if}
    </section>
  {/if}

  <!-- ═══ Про себе / про компанію ═══ -->
  <section aria-labelledby="about-heading" class="mt-8">
    <h2 id="about-heading" class="text-[15px] font-semibold">
      {isCompany ? 'Про компанію' : 'Про себе'}
    </h2>
    {#if user.bio}
      <p
        class="mt-2 leading-relaxed text-muted-foreground [overflow-wrap:anywhere]"
      >
        {user.bio}
      </p>
    {:else}
      <p class="mt-2 text-muted-foreground">
        {isOwner
          ? 'Ти ще не додав опис.'
          : isCompany
            ? 'Компанія ще не додала опис.'
            : 'Майстер ще не додав опис.'}
      </p>
    {/if}
  </section>

  <!-- ═══ Приклади робіт ═══ -->
  {#if user.portfolioImages.length > 0}
    <section aria-labelledby="portfolio-heading" class="mt-8">
      <h2 id="portfolio-heading" class="mb-3 text-[15px] font-semibold">
        Приклади робіт
      </h2>
      <PhotoGallery images={user.portfolioImages} />
    </section>
  {/if}

  <!-- ═══ Відгуки ═══ -->
  <section aria-labelledby="reviews-heading" class="mt-8">
    <h2 id="reviews-heading" class="text-[15px] font-semibold">Відгуки</h2>

    {#if user.reviews.length > 0}
      <ul class="mt-1 list-none p-0">
        {#each user.reviews as review, i (review.id ?? i)}
          {@const stars = starCount(review.rating)}
          {@const reviewDate = formatDate(review.createdAt, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          <li class="border-b border-border/60 py-5">
            <div class="flex items-center gap-3">
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
                aria-hidden="true"
              >
                {review.authorInitials}
              </div>
              <span class="min-w-0 flex-1 truncate text-[15px]">
                {review.authorName}
              </span>
              <div
                class="flex shrink-0 gap-0.5"
                aria-label={`Рейтинг: ${stars} з 5`}
              >
                {#each Array(stars) as _, j (j)}
                  <Star
                    class="size-3 fill-amber-400 text-amber-400"
                    aria-hidden="true"
                  />
                {/each}
              </div>
            </div>

            <p
              class="mt-2 leading-relaxed text-muted-foreground [overflow-wrap:anywhere]"
            >
              {review.text}
            </p>
            <p class="mt-2 text-[13px] text-muted-foreground/70">
              <time datetime={reviewDate.iso}>{reviewDate.display}</time>
            </p>
          </li>
        {/each}
      </ul>
    {:else}
      <!-- Без сірої плашки: порожній список — не подія, на яку треба
           дивитись. -->
      <p class="mt-2 text-muted-foreground">
        {isOwner
          ? 'Клієнти лишають відгук після виконаного замовлення.'
          : 'Ще немає відгуків'}
      </p>
    {/if}
  </section>
</article>
