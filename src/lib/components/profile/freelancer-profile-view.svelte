<script lang="ts">
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import { goto } from '$app/navigation'
  import {
    BadgeCheck,
    Copy,
    Check,
    MapPin,
    Star,
    Calendar,
    Zap,
    MessageSquare,
    User,
    Pencil,
    Sparkles,
    Image,
  } from 'lucide-svelte'
  import type { FreelancerProfileData as ProfileData } from '$lib/components/profile/types'
  import { getBannerForCategories } from '$lib/categories/registry'
  import PhotoGallery from '$lib/components/photo-gallery.svelte'
  import { Button } from '../ui/button'

  import { toast } from '$lib/stores/toast-store.svelte'

  interface Props {
    user: ProfileData
    isOwner: boolean
    /** Зарезервовано: гейт для CTA «написати майстру», коли зʼявиться чат із профілю. */
    isAuthenticated: boolean
  }
  // isAuthenticated поки не використовується у в'ю — не деструктуруємо, щоб не плодити m's warning.
  let { user, isOwner }: Props = $props()

  // ── Безпечний JSON-LD: екрануємо символи, що можуть зламати <script> або HTML-контекст ──
  function safeJsonLd(data: Record<string, unknown>): string {
    const map: Record<string, string> = {
      '<': '\\u003c',
      '>': '\\u003e',
      '&': '\\u0026',
      '\u2028': '\\u2028',
      '\u2029': '\\u2029',
    }
    return JSON.stringify(data).replace(
      /[<>&\u2028\u2029]/g,
      (c) => map[c] ?? c,
    )
  }

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
    formatDate(user.createdAt, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
  )
  const profileUrl = $derived(
    user.username ? `/@${user.username}` : `/dashboard`,
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
  const isTopPerformer = $derived(user.completedOrders >= 50)
  const bannerUrl = $derived(
    user.categorySlugs.length > 0
      ? getBannerForCategories(user.categorySlugs)
      : null,
  )

  // Категорія, до якої належить майстер (на MVP — одна: «Прибирання»).
  const primaryCategory = $derived(user.categories[0] ?? null)

  function goEdit(): void {
    goto('/onboarding')
  }
</script>

<svelte:head>
  {@html `<script type="application/ld+json">${personJsonLd}<\/script>`}
</svelte:head>

<article
  class=" min-h-svh px-5 pt-7 pb-20 md:pb-12"
  itemscope
  itemtype="https://schema.org/Person"
>
  <div class="mx-auto flex max-w-[620px] flex-col gap-4">
    <!-- ═══ HERO: banner + avatar ═══ -->
    <div class="card overflow-hidden">
      <div class="relative h-[180px] bg-gradient-to-br from-muted to-secondary">
        {#if bannerUrl}
          <img
            src={bannerUrl}
            alt=""
            aria-hidden="true"
            loading="eager"
            decoding="async"
            class="absolute inset-0 size-full object-cover"
          />
        {/if}
        <div
          class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 to-transparent"
        ></div>
      </div>

      <div class="px-7 pb-[26px]">
        <div class="mt-[-52px] mb-4 flex items-end justify-between gap-4">
          <div class="relative">
            {#if user.avatar && !avatarLoaded}
              <div
                class="absolute inset-0 z-10 size-[104px] overflow-hidden rounded-full border-4 border-card"
              >
                <Skeleton class="size-full rounded-full" />
              </div>
            {/if}
            <Avatar class="size-[104px] border-4 border-card shadow-md">
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
                class="cursor-default bg-foreground text-[38px] font-bold text-background"
              >
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>

          {#if isOwner}
            <Button
              type="button"
              onclick={goEdit}
              class="mb-1 inline-flex h-[42px] items-center gap-[7px] rounded-full bg-primary px-[18px] text-[13.5px] font-semibold text-white transition-transform hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40 motion-reduce:transition-none"
            >
              <Pencil class="size-[15px]" aria-hidden="true" /> Редагувати
            </Button>
          {/if}
        </div>

        <div class="flex items-center gap-[7px]">
          <h1
            class="truncate text-[25px] font-bold tracking-[-0.03em] text-foreground"
            itemprop="name"
          >
            {user.name}
          </h1>
          {#if user.verificationStatus === 'VERIFIED'}
            <BadgeCheck
              class="size-5 shrink-0 fill-primary stroke-primary-foreground"
              aria-label="Верифікований"
            />
          {/if}
        </div>

        {#if user.username}
          <p
            class="mt-1 flex items-center gap-[7px] text-sm text-muted-foreground"
          >
            <span itemprop="alternateName">@{user.username}</span>
            <button
              type="button"
              onclick={copyUsername}
              class="rounded-sm cursor-pointer text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
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

        <div class="my-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span
            class="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground"
          >
            <Calendar class="size-[13px]" aria-hidden="true" />
            <time datetime={created.iso}>З нами з {created.display}</time>
          </span>
          {#if user.city}
            <span class="text-muted-foreground/50" aria-hidden="true">·</span>
            <span
              class="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground"
              itemprop="address"
              itemscope
              itemtype="https://schema.org/PostalAddress"
            >
              <MapPin class="size-[13px]" aria-hidden="true" />
              <span itemprop="addressLocality">{user.city}</span>
            </span>
          {/if}
        </div>

        <div class="flex flex-wrap gap-2">
          <span
            class="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-secondary px-[13px] text-[12.5px] font-semibold text-secondary-foreground"
          >
            <Sparkles class="size-3" aria-hidden="true" /> Майстер
          </span>
          {#if isTopPerformer}
            <span
              class="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-amber-500/10 px-[13px] text-[12.5px] font-semibold text-amber-700 dark:text-amber-400"
            >
              <Star class="size-3" aria-hidden="true" /> Топ виконавець
            </span>
          {/if}
        </div>

        {#if isOwner}
          <button
            type="button"
            onclick={goEdit}
            class="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[14.5px] font-semibold text-background transition-transform hover:-translate-y-px active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40 motion-reduce:transition-none sm:hidden"
          >
            <Pencil class="size-4" aria-hidden="true" /> Редагувати профіль
          </button>
        {/if}
      </div>
    </div>

    <!-- ═══ ABOUT + CATEGORY ═══ -->
    <section aria-labelledby="about-heading" class="card p-7">
      <h2
        id="about-heading"
        class="mb-4 inline-flex items-center gap-[7px] text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
      >
        <User class="size-3.5" aria-hidden="true" /> Про себе
      </h2>

      {#if user.bio}
        <p
          class="text-[14.5px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]"
          itemprop="description"
        >
          {user.bio}
        </p>
      {:else}
        <p class="text-[14.5px] text-muted-foreground/60 italic">
          {isOwner ? 'Ти ще не додав опис.' : 'Майстер ще не додав опис.'}
        </p>
      {/if}

      {#if primaryCategory}
        <div class="mt-5 flex items-center gap-2.5">
          <span class="text-[13px] text-muted-foreground">Категорія</span>
          <span
            class="inline-flex h-8 items-center rounded-full bg-secondary px-3.5 text-[13px] font-medium text-secondary-foreground"
          >
            {primaryCategory}
          </span>
        </div>
      {/if}
    </section>

    <!-- ═══ PORTFOLIO ═══ -->
    {#if user.portfolioImages.length > 0}
      <section aria-labelledby="portfolio-heading" class="card p-7">
        <h2
          id="portfolio-heading"
          class="mb-4 inline-flex items-center gap-[7px] text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
        >
          <Image class="size-3.5" aria-hidden="true" /> Приклади робіт
        </h2>
        <PhotoGallery images={user.portfolioImages} />
      </section>
    {/if}

    <!-- ═══ STATS ═══ -->
    <section aria-labelledby="stats-heading" class="card p-7">
      <h2
        id="stats-heading"
        class="mb-4 inline-flex items-center gap-[7px] text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
      >
        <Zap class="size-3.5" aria-hidden="true" /> Статистика
      </h2>
      <dl class="grid grid-cols-2 gap-2.5">
        <div class="rounded-2xl bg-muted px-[18px] py-4">
          <dt
            class="mb-1.5 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground"
          >
            <Star
              class="size-3 fill-amber-400 text-amber-400"
              aria-hidden="true"
            /> Рейтинг
          </dt>
          <dd
            class="m-0 text-2xl font-bold tracking-[-0.03em] text-foreground tabular-nums"
          >
            {fmtRating(user.avgRating)}
            <span class="text-[13px] font-medium text-muted-foreground"
              >/ 5.0</span
            >
          </dd>
        </div>
        <div class="rounded-2xl bg-muted px-[18px] py-4">
          <dt
            class="mb-1.5 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground"
          >
            <BadgeCheck class="size-3" aria-hidden="true" /> Виконано
          </dt>
          <dd
            class="m-0 text-2xl font-bold tracking-[-0.03em] text-foreground tabular-nums"
          >
            {user.completedOrders ?? 0}
            <span class="text-[13px] font-medium text-muted-foreground"
              >замовлень</span
            >
          </dd>
        </div>
      </dl>
    </section>

    <!-- ═══ REVIEWS ═══ -->
    <section aria-labelledby="reviews-heading" class="card p-7">
      <div class="mb-4 flex items-center justify-between">
        <h2
          id="reviews-heading"
          class="inline-flex items-center gap-[7px] text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
        >
          <MessageSquare class="size-3.5" aria-hidden="true" /> Відгуки
        </h2>
        {#if user.reviewsCount > 0}
          <span
            class="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground"
          >
            <Star
              class="size-3 fill-amber-400 text-amber-400"
              aria-hidden="true"
            />
            <b class="font-semibold text-foreground"
              >{fmtRating(user.avgRating)}</b
            >
            · {user.reviewsCount}
            {reviewsLabel(user.reviewsCount)}
          </span>
        {/if}
      </div>

      {#if user.reviews.length > 0}
        <ul class="m-0 list-none p-0">
          {#each user.reviews as review, i (review.id ?? i)}
            {@const stars = starCount(review.rating)}
            {@const reviewDate = formatDate(review.createdAt, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            <li
              class="border-t border-border py-[18px] first:border-t-0 first:pt-0"
              itemprop="review"
              itemscope
              itemtype="https://schema.org/Review"
            >
              <div class="mb-2.5 flex items-center gap-2.5">
                <div
                  class="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-muted text-[11.5px] font-semibold text-foreground"
                  aria-hidden="true"
                >
                  {review.authorInitials}
                </div>
                <span
                  class="flex-1 truncate text-sm font-semibold text-foreground"
                  itemprop="author"
                >
                  {review.authorName}
                </span>
                <div
                  class="ml-auto flex gap-0.5"
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
                class="pl-10 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]"
                itemprop="reviewBody"
              >
                {review.text}
              </p>
              <p class="mt-2 pl-10 text-[11.5px] text-muted-foreground/70">
                <time datetime={reviewDate.iso}>{reviewDate.display}</time>
              </p>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="rounded-2xl bg-muted py-8 text-center">
          <p class="text-sm text-muted-foreground">
            {isOwner
              ? 'Поки що немає відгуків. Виконай перше замовлення — і клієнти почнуть лишати відгуки.'
              : 'Ще немає відгуків'}
          </p>
        </div>
      {/if}
    </section>
  </div>
</article>

<style>
  /* Єдине джерело правди для картки: радіус, рамка, фон, тінь. Тінь — alpha-чорний (працює в обох темах). */
  .card {
    border-radius: 28px;
    border: 1px solid var(--border);
    background-color: var(--card);
    box-shadow:
      0 20px 50px -16px rgba(0, 0, 0, 0.1),
      0 4px 12px -6px rgba(0, 0, 0, 0.05);
  }
</style>
