<!--
  Профіль майстра — публічна сторінка (/@handle), тому мікророзмітка й
  JSON-LD лишаються: саме з неї пошук бере ім'я, місто й рейтинг.

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
  import { safeJsonLd } from '$lib/utils/json-ld'
  import { BadgeCheck, Copy, Check, Star } from 'lucide-svelte'
  import type { FreelancerProfileData as ProfileData } from '$lib/components/profile/types'
  import PhotoGallery from '$lib/components/photo-gallery.svelte'
  import { getBannerForCategories } from '$lib/categories/registry'
  import toast from 'svelte-hot-french-toast'

  interface Props {
    user: ProfileData
    isOwner: boolean
    /** Зарезервовано: гейт для CTA «написати майстру», коли зʼявиться чат із профілю. */
    isAuthenticated: boolean
  }
  // isAuthenticated поки не використовується у в'ю — не деструктуруємо, щоб не плодити warning.
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

  const created = $derived(
    formatDate(user.createdAt, { month: 'long', year: 'numeric' }),
  )
  const profileUrl = $derived(
    user.username ? `/@${user.username}` : `/dashboard`,
  )
  const hasRating = $derived(user.reviewsCount > 0)
  const bannerUrl = $derived(
    user.categorySlugs.length > 0
      ? getBannerForCategories(user.categorySlugs)
      : null,
  )

  // SEO: Person schema. Безпечно — проходить через safeJsonLd().
  const personJsonLd = $derived(
    safeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: user.name,
      ...(user.username && {
        alternateName: `@${user.username}`,
        url: profileUrl,
      }),
      ...(user.avatar && { image: user.avatar }),
      ...(user.bio && { description: user.bio }),
      ...(user.city && {
        address: {
          '@type': 'PostalAddress',
          addressLocality: user.city,
          addressCountry: 'UA',
        },
      }),
      ...(user.categories.length > 0 && { knowsAbout: user.categories }),
      ...(user.reviewsCount > 0 && {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: user.avgRating,
          reviewCount: user.reviewsCount,
          bestRating: 5,
          worstRating: 1,
        },
      }),
    }),
  )

  let avatarLoaded = $state(false)
  let copied = $state(false)
  let copyTimer: ReturnType<typeof setTimeout> | undefined

  async function copyUsername(): Promise<void> {
    if (!user.username) return
    try {
      await navigator.clipboard.writeText('@' + user.username)
      copied = true
      clearTimeout(copyTimer)
      copyTimer = setTimeout(() => (copied = false), 2000)
      toast.success('Скопійовано', { duration: 2000 })
    } catch {
      // Clipboard недоступний (HTTP / дозволи) — мовчки ігноруємо.
    }
  }
  // Чистимо таймер при розмонтуванні.
  $effect(() => () => clearTimeout(copyTimer))

  const initials = $derived(
    (user.name ?? '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?',
  )

  // Показуємо ВСІ категорії, а не лише першу. На сьогодні вона одна
  // («Прибирання»), але додавання другої має бути додаванням контенту, а
  // не правкою розмітки. Тим паче що в schema.org (knowsAbout) уже їдуть
  // усі — тобто пошуковик бачив більше, ніж людина на сторінці.
  const categoryLabel = $derived(
    user.categories.length > 1 ? 'Категорії' : 'Категорія',
  )
</script>

<svelte:head>
  {@html `<script type="application/ld+json">${personJsonLd}<\/script>`}
</svelte:head>

<article
  class="mx-auto w-full max-w-150 px-5 pt-10 pb-16"
  itemscope
  itemtype="https://schema.org/Person"
>
  <!-- ═══ Банер ═══
       Нижчий за попередній (180px) і без темного градієнта поверх:
       градієнт існував, щоб на картинці читався текст, а тексту на ній
       більше немає. Скруглення — спільні 8px. -->
  {#if bannerUrl}
    <div class="h-32 overflow-hidden rounded-[8px] bg-muted sm:h-40">
      <img
        src={bannerUrl}
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
        class="size-full object-cover"
      />
    </div>
  {/if}

  <!-- ═══ Хто це ═══ -->
  <header
    class="flex flex-col items-center text-center {bannerUrl ? '-mt-10' : ''}"
  >
    <div class="relative">
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
            alt="Аватар {user.name}"
            loading="eager"
            fetchpriority="high"
            decoding="async"
            onload={() => (avatarLoaded = true)}
            onerror={() => (avatarLoaded = true)}
          />
          <meta itemprop="image" content={user.avatar} />
        {/if}
        <AvatarFallback
          class="cursor-default bg-muted text-2xl font-medium text-muted-foreground"
        >
          {initials}
        </AvatarFallback>
      </Avatar>
    </div>

    <div class="mt-4 flex items-center gap-1.5">
      <h1 class="text-2xl font-semibold" itemprop="name">{user.name}</h1>
      {#if user.verificationStatus === 'VERIFIED'}
        <BadgeCheck
          class="size-5 shrink-0 fill-primary stroke-primary-foreground"
          aria-label="Верифікований"
        />
      {/if}
    </div>

    {#if user.username}
      <p
        class="mt-1 flex items-center gap-1.5 text-[15px] text-muted-foreground"
      >
        <span itemprop="alternateName">@{user.username}</span>
        <button
          type="button"
          onclick={copyUsername}
          class="cursor-pointer rounded-sm text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={copied ? 'Нікнейм скопійовано' : 'Скопіювати нікнейм'}
        >
          {#if copied}
            <Check class="size-4 text-emerald-500" aria-hidden="true" />
          {:else}
            <Copy class="size-4" aria-hidden="true" />
          {/if}
        </button>
      </p>
    {/if}

    <!-- Місто й дата одним рядком, без піктограм: це підпис під іменем,
         а не дані, заради яких потрібні значки. -->
    <p class="mt-1 text-[15px] text-muted-foreground">
      {#if user.city}<span
          itemprop="address"
          itemscope
          itemtype="https://schema.org/PostalAddress"
          ><span itemprop="addressLocality">{user.city}</span></span
        > ·
      {/if}з {created.display}
    </p>

    {#if isOwner}
      <a
        href="/dashboard/settings/profile"
        class="mt-5 inline-flex h-9 items-center rounded-[8px] border border-primary px-4 text-[14px] text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Редагувати профіль
      </a>
    {/if}
  </header>

  <!-- ═══ Як працював ═══
       Значка «Топ виконавець» немає: він вмикався на 50 виконаних
       замовленнях, а саме це число стоїть поруч у цифрах. Рейтинг
       показуємо лише коли є відгуки — «0.0» читається як погана оцінка,
       а не як «оцінок ще немає». -->
  <div
    class="mt-8 grid grid-cols-3 divide-x divide-border/60 border-y border-border/60 py-5 text-center"
  >
    <div>
      <div
        class="inline-flex items-center gap-1.5 text-[22px] font-semibold tabular-nums"
      >
        {#if hasRating}
          <Star
            class="size-4 fill-amber-400 text-amber-400"
            aria-hidden="true"
          />
          {fmtRating(user.avgRating)}
        {:else}
          <span class="text-muted-foreground">—</span>
        {/if}
      </div>
      <div class="mt-0.5 text-[13px] text-muted-foreground">рейтинг</div>
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
      <div class="mt-2 flex flex-wrap gap-2">
        {#each user.categories as category (category)}
          <span
            class="inline-flex h-8 items-center rounded-[8px] bg-muted px-3 text-[14px]"
          >
            {category}
          </span>
        {/each}
      </div>
    </section>
  {/if}

  <!-- ═══ Про себе ═══ -->
  <section aria-labelledby="about-heading" class="mt-8">
    <h2 id="about-heading" class="text-[15px] font-semibold">Про себе</h2>
    {#if user.bio}
      <p
        class="mt-2 leading-relaxed text-muted-foreground [overflow-wrap:anywhere]"
        itemprop="description"
      >
        {user.bio}
      </p>
    {:else}
      <p class="mt-2 text-muted-foreground">
        {isOwner ? 'Ти ще не додав опис.' : 'Майстер ще не додав опис.'}
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
          <li
            class="border-b border-border/60 py-5"
            itemprop="review"
            itemscope
            itemtype="https://schema.org/Review"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
                aria-hidden="true"
              >
                {review.authorInitials}
              </div>
              <span
                class="min-w-0 flex-1 truncate text-[15px]"
                itemprop="author"
              >
                {review.authorName}
              </span>
              <div
                class="flex shrink-0 gap-0.5"
                itemprop="reviewRating"
                itemscope
                itemtype="https://schema.org/Rating"
                aria-label={`Рейтинг: ${stars} з 5`}
              >
                <meta itemprop="ratingValue" content={String(stars)} />
                <meta itemprop="bestRating" content="5" />
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
              itemprop="reviewBody"
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
