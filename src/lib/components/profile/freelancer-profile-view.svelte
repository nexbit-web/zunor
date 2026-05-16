<!-- src/lib/components/profile/freelancer-profile-view.svelte -->
<script lang="ts">
  import { Badge } from '$lib/components/ui/badge'
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Button } from '$lib/components/ui/button'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import { goto } from '$app/navigation'
  import {
    BadgeCheck,
    Copy,
    Check,
    MapPin,
    Clock,
    Star,
    Calendar,
    Zap,
    MessageSquare,
    User,
    Pencil,
    ShieldAlert,
    Sparkles,
  } from 'lucide-svelte'

  import type { FreelancerProfileData as ProfileData } from '$lib/components/profile/types'

  interface Props {
    user: ProfileData
    isOwner: boolean
    isAuthenticated: boolean
  }

  let { user, isOwner }: Props = $props()

  // ─── Derived (memoized) ───
  const memberSince = $derived(
    new Date(user.createdAt).toLocaleDateString('uk-UA', {
      month: 'short',
      year: 'numeric',
    }),
  )

  const memberSinceISO = $derived(new Date(user.createdAt).toISOString())

  const profileUrl = $derived(
    user.username ? `/@${user.username}` : `/dashboard`,
  )

  // SEO: JSON-LD Person schema
  const personJsonLd = $derived(
    JSON.stringify({
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
      ...(user.categories &&
        user.categories.length > 0 && {
          knowsAbout: user.categories,
        }),
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

  // ─── Стан завантаження картинок ───
  let bannerLoaded = $state(false)
  let avatarLoaded = $state(false)

  // ─── Копіювати ───
  let copied = $state(false)
  async function copyUsername() {
    if (!user.username) return
    try {
      await navigator.clipboard.writeText('@' + user.username)
      copied = true
      setTimeout(() => (copied = false), 1200)
    } catch {
      // silent fail
    }
  }

  function goEdit() {
    goto('/settings')
  }

  // ─── Helpers ───
  const initials = $derived(
    (user.name ?? '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?',
  )

  function reviewsLabel(n: number): string {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return 'відгук'
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100))
      return 'відгуки'
    return 'відгуків'
  }

  // Топ-виконавець: 50+ виконаних замовлень
  const isTopPerformer = $derived(user.completedOrders >= 50)
</script>

<svelte:head>
  {@html `<script type="application/ld+json">${personJsonLd}</script>`}
</svelte:head>

<article
  class="min-h-screen pb-20 md:pb-10"
  style="background-color: var(--background)"
  itemscope
  itemtype="https://schema.org/Person"
>
  <!-- ═══════ БАНЕР (gradient placeholder) ═══════ -->
  <header class="px-4 pt-4 sm:px-6 sm:pt-6">
    <div
      class="relative w-full h-32 xs:h-40 sm:h-52 rounded-2xl overflow-hidden"
      style="background: linear-gradient(135deg,
              color-mix(in oklch, var(--primary) 25%, transparent),
              color-mix(in oklch, var(--primary) 10%, transparent),
              color-mix(in oklch, var(--foreground) 5%, transparent));"
    >
      <div
        class="absolute inset-0 pointer-events-none"
        style="background: linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.25))"
      ></div>
    </div>
  </header>

  <div class="max-w-2xl mx-auto px-4 sm:px-8">
    <!-- ═══════ АВАТАР + CTA ═══════ -->
    <div class="flex items-start justify-between gap-3">
      <div class="-mt-12 sm:-mt-14 relative">
        {#if user.avatar && !avatarLoaded}
          <div
            class="absolute inset-0 size-24 sm:size-32 rounded-full border-4 overflow-hidden z-10"
            style="border-color: var(--background)"
          >
            <Skeleton class="w-full h-full rounded-full" />
          </div>
        {/if}
        <Avatar
          class="size-24 sm:size-32 border-4 shadow-lg"
          style="border-color: var(--background)"
        >
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
            class="text-3xl sm:text-4xl font-semibold cursor-default"
            style="background-color: var(--primary); color: var(--primary-foreground)"
          >
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>

      {#if isOwner}
        <nav
          aria-label="Дії з профілем"
          class="hidden sm:flex items-center gap-2 mt-4"
        >
          <Button onclick={goEdit} class="h-10 rounded-full gap-1.5">
            <Pencil class="size-3.5" aria-hidden="true" />
            Редагувати профіль
          </Button>
        </nav>
      {/if}
    </div>

    <!-- ═══════ Імʼя + статус ═══════ -->
    <section class="mt-3 mb-5" aria-label="Основна інформація">
      <div class="flex items-start justify-between gap-2 mb-1">
        <div class="flex items-center gap-1.5 min-w-0">
          <h1
            class="text-xl font-semibold truncate"
            style="color: var(--foreground)"
            itemprop="name"
          >
            {user.name}
          </h1>
          {#if user.verificationStatus === 'VERIFIED'}
            <BadgeCheck
              class="size-5 shrink-0"
              style="color: var(--primary); fill: var(--primary); stroke: var(--primary-foreground)"
              aria-label="Верифікований"
            />
          {/if}
        </div>

        {#if user.verificationStatus === 'VERIFIED'}
          <span
            class="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0"
            style="background-color: color-mix(in oklch, var(--primary) 10%, transparent);
                   color: var(--primary);
                   border: 1px solid color-mix(in oklch, var(--primary) 30%, transparent)"
            role="status"
          >
            <BadgeCheck class="size-3" aria-hidden="true" />
            VERIFIED
          </span>
        {:else if user.verificationStatus === 'PENDING'}
          <span
            class="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0"
            style="background-color: color-mix(in oklch, #f59e0b 15%, transparent);
                   color: #b45309;
                   border: 1px solid color-mix(in oklch, #f59e0b 30%, transparent)"
            role="status"
          >
            <Clock class="size-3" aria-hidden="true" />
            НА МОДЕРАЦІЇ
          </span>
        {:else if user.verificationStatus === 'REJECTED'}
          <span
            class="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0"
            style="background-color: color-mix(in oklch, var(--destructive) 12%, transparent);
                   color: var(--destructive);
                   border: 1px solid color-mix(in oklch, var(--destructive) 25%, transparent)"
            role="status"
          >
            <ShieldAlert class="size-3" aria-hidden="true" />
            ВІДХИЛЕНО
          </span>
        {/if}
      </div>

      {#if user.username}
        <p
          class="text-sm flex items-center gap-1.5 mb-2"
          style="color: var(--muted-foreground)"
        >
          <span itemprop="alternateName">@{user.username}</span>
          <button
            type="button"
            onclick={copyUsername}
            class="cursor-pointer transition-colors hover:text-foreground"
            aria-label="Скопіювати нікнейм"
          >
            {#if copied}
              <Check class="size-3" style="color: #10b981" aria-hidden="true" />
            {:else}
              <Copy class="size-3" aria-hidden="true" />
            {/if}
          </button>
        </p>
      {/if}

      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
        <span
          class="flex items-center gap-1 text-xs"
          style="color: var(--muted-foreground)"
        >
          <Calendar class="size-3" aria-hidden="true" />
          З <time datetime={memberSinceISO}>{memberSince}</time>
        </span>
        {#if user.city}
          <span class="text-xs opacity-30" aria-hidden="true">·</span>
          <span
            class="flex items-center gap-1 text-xs"
            style="color: var(--muted-foreground)"
            itemprop="address"
            itemscope
            itemtype="https://schema.org/PostalAddress"
          >
            <MapPin class="size-3" aria-hidden="true" />
            <span itemprop="addressLocality">{user.city}</span>
          </span>
        {/if}
      </div>

      <p class="text-sm mb-4" style="color: var(--muted-foreground)">
        <span class="font-medium" style="color: var(--foreground)">
          {user.completedOrders ?? 0}
        </span>
        замовлень
        {#if user.reviewsCount > 0}
          ·
          <span class="font-medium" style="color: var(--primary)">
            {user.reviewsCount}
            {reviewsLabel(user.reviewsCount)}
          </span>
          ·
          <span style="color: #f5a623; font-weight: 500">
            ★ {user.avgRating.toFixed(1)}
          </span>
        {/if}
      </p>

      <!-- Бейджи -->
      <div class="flex flex-wrap gap-2">
        <Badge
          variant="outline"
          class="rounded-full text-xs font-normal px-3 py-1 cursor-default gap-1.5"
        >
          <Sparkles class="size-3" aria-hidden="true" />
          Майстер
        </Badge>
        {#if user.verificationStatus === 'VERIFIED'}
          <Badge
            variant="outline"
            class="rounded-full text-xs font-normal px-3 py-1 cursor-default gap-1.5"
            style="border-color: color-mix(in oklch, var(--primary) 30%, transparent); color: var(--primary)"
          >
            <BadgeCheck class="size-3" aria-hidden="true" />
            Перевірений
          </Badge>
        {/if}
        {#if isTopPerformer}
          <Badge
            variant="outline"
            class="rounded-full text-xs font-normal px-3 py-1 cursor-default gap-1.5"
            style="border-color: color-mix(in oklch, #f59e0b 30%, transparent); color: #b45309"
          >
            <Star class="size-3" aria-hidden="true" />
            Топ виконавець
          </Badge>
        {/if}
      </div>

      <!-- Mobile edit -->
      {#if isOwner}
        <nav class="flex sm:hidden mt-4">
          <Button onclick={goEdit} class="w-full h-11 rounded-full gap-2">
            <Pencil class="size-4" aria-hidden="true" />
            Редагувати профіль
          </Button>
        </nav>
      {/if}
    </section>

    <!-- Причина відхилення — тільки owner -->
    {#if isOwner && user.verificationStatus === 'REJECTED' && user.verificationRejectReason}
      <aside
        class="p-4 rounded-xl mb-5"
        style="background-color: color-mix(in oklch, var(--destructive) 8%, transparent);
               border: 1px solid color-mix(in oklch, var(--destructive) 20%, transparent)"
        role="alert"
      >
        <p
          class="text-sm font-medium flex items-center gap-1.5 mb-1"
          style="color: var(--destructive)"
        >
          <ShieldAlert class="size-4" aria-hidden="true" />
          Профіль відхилено модератором
        </p>
        <p
          class="text-sm leading-relaxed"
          style="color: var(--muted-foreground); overflow-wrap: anywhere"
        >
          {user.verificationRejectReason}
        </p>
      </aside>
    {/if}

    <div
      class="border-t"
      style="border-color: color-mix(in oklch, var(--foreground) 6%, transparent)"
    ></div>

    <!-- ═══════ Про себе ═══════ -->
    <section class="py-5 space-y-4" aria-labelledby="about-heading">
      <h2
        id="about-heading"
        class="text-[11px] font-medium tracking-widest uppercase flex items-center gap-1.5"
        style="color: var(--muted-foreground)"
      >
        <User class="size-3.5" aria-hidden="true" /> Про себе
      </h2>

      {#if user.bio}
        <p
          class="text-sm leading-relaxed"
          style="color: var(--muted-foreground); overflow-wrap: anywhere"
          itemprop="description"
        >
          {user.bio}
        </p>
      {:else}
        <p
          class="text-sm italic"
          style="color: var(--muted-foreground); opacity: 0.6"
        >
          {isOwner ? 'Ви ще не додали опис.' : 'Користувач ще не додав опис.'}
        </p>
      {/if}

      {#if user.categories && user.categories.length > 0}
        <div class="flex items-start justify-between gap-4">
          <span class="text-sm shrink-0" style="color: var(--muted-foreground)">
            Категорії
          </span>
          <div class="flex flex-wrap gap-1.5 justify-end">
            {#each user.categories as cat (cat)}
              <Badge
                class="rounded-full text-xs font-normal"
                style="background-color: color-mix(in oklch, var(--primary) 12%, transparent);
                       color: var(--primary);
                       border: 1px solid color-mix(in oklch, var(--primary) 25%, transparent)"
              >
                {cat}
              </Badge>
            {/each}
          </div>
        </div>
      {/if}
    </section>

    <div
      class="border-t"
      style="border-color: color-mix(in oklch, var(--foreground) 6%, transparent)"
    ></div>

    <!-- ═══════ Статистика ═══════ -->
    <section class="py-5" aria-labelledby="stats-heading">
      <h2
        id="stats-heading"
        class="text-[11px] font-medium tracking-widest uppercase mb-4 flex items-center gap-1.5"
        style="color: var(--muted-foreground)"
      >
        <Zap class="size-3.5" aria-hidden="true" /> Статистика
      </h2>

      <dl class="grid grid-cols-2 gap-2 sm:gap-3">
        <div
          class="rounded-lg px-3 sm:px-4 py-3 border"
          style="background-color: color-mix(in oklch, var(--foreground) 3%, transparent);
                 border-color: color-mix(in oklch, var(--foreground) 6%, transparent)"
        >
          <dt
            class="text-xs mb-1 flex items-center gap-1.5"
            style="color: var(--muted-foreground)"
          >
            <Star class="size-3" aria-hidden="true" /> Рейтинг
          </dt>
          <dd
            class="text-lg sm:text-xl font-semibold tabular-nums m-0"
            style="color: var(--foreground)"
          >
            {user.avgRating.toFixed(1)}
            <span
              class="text-xs sm:text-sm font-normal"
              style="color: var(--muted-foreground)"
            >
              / 5.0
            </span>
          </dd>
        </div>

        <div
          class="rounded-lg px-3 sm:px-4 py-3 border"
          style="background-color: color-mix(in oklch, var(--foreground) 3%, transparent);
                 border-color: color-mix(in oklch, var(--foreground) 6%, transparent)"
        >
          <dt
            class="text-xs mb-1 flex items-center gap-1.5"
            style="color: var(--muted-foreground)"
          >
            <BadgeCheck class="size-3" aria-hidden="true" /> Виконано
          </dt>
          <dd
            class="text-lg sm:text-xl font-semibold tabular-nums m-0"
            style="color: var(--foreground)"
          >
            {user.completedOrders ?? 0}
            <span
              class="text-xs sm:text-sm font-normal"
              style="color: var(--muted-foreground)"
            >
              замовлень
            </span>
          </dd>
        </div>
      </dl>
    </section>

    <div
      class="border-t"
      style="border-color: color-mix(in oklch, var(--foreground) 6%, transparent)"
    ></div>

    <!-- ═══════ Відгуки ═══════ -->
    <section class="py-5" aria-labelledby="reviews-heading">
      <div class="flex items-center justify-between mb-6">
        <h2
          id="reviews-heading"
          class="text-[11px] font-medium tracking-widest uppercase flex items-center gap-1.5"
          style="color: var(--muted-foreground)"
        >
          <MessageSquare class="size-3.5" aria-hidden="true" /> Відгуки
        </h2>
        {#if user.reviewsCount > 0}
          <span
            class="text-xs flex items-center gap-1"
            style="color: var(--muted-foreground)"
          >
            <Star
              class="size-3"
              style="color: #f5a623; fill: #f5a623"
              aria-hidden="true"
            />
            {user.avgRating.toFixed(1)} · {user.reviewsCount}
            {reviewsLabel(user.reviewsCount)}
          </span>
        {/if}
      </div>

      {#if user.reviews && user.reviews.length > 0}
        <ul class="list-none p-0 m-0">
          {#each user.reviews as review, i (review.id ?? i)}
            <li
              class="py-5 first:pt-0"
              style="border-top: {i === 0
                ? 'none'
                : '1px solid color-mix(in oklch, var(--foreground) 5%, transparent)'}"
              itemprop="review"
              itemscope
              itemtype="https://schema.org/Review"
            >
              <div class="flex items-center gap-2 mb-2">
                <div
                  class="size-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 border"
                  style="background-color: color-mix(in oklch, var(--foreground) 4%, transparent);
                         border-color: color-mix(in oklch, var(--foreground) 8%, transparent);
                         color: var(--primary)"
                  aria-hidden="true"
                >
                  {review.authorInitials}
                </div>
                <span
                  class="text-sm font-medium"
                  style="color: var(--foreground)"
                  itemprop="author"
                >
                  {review.authorName}
                </span>
                <div
                  class="flex ml-auto gap-0.5"
                  itemprop="reviewRating"
                  itemscope
                  itemtype="https://schema.org/Rating"
                  aria-label={`Рейтинг: ${review.rating} з 5`}
                >
                  <meta
                    itemprop="ratingValue"
                    content={String(review.rating)}
                  />
                  <meta itemprop="bestRating" content="5" />
                  {#each Array(review.rating) as _, j (j)}
                    <Star
                      class="size-3"
                      style="color: #f5a623; fill: #f5a623"
                      aria-hidden="true"
                    />
                  {/each}
                </div>
              </div>
              <p
                class="text-sm leading-relaxed pl-9"
                style="color: var(--muted-foreground); overflow-wrap: anywhere"
                itemprop="reviewBody"
              >
                {review.text}
              </p>
              <p
                class="text-[11px] mt-2 pl-9"
                style="color: color-mix(in oklch, var(--muted-foreground) 60%, transparent)"
              >
                <time datetime={new Date(review.createdAt).toISOString()}>
                  {new Date(review.createdAt).toLocaleDateString('uk-UA', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </time>
              </p>
            </li>
          {/each}
        </ul>
      {:else}
        <div
          class="text-center py-8 rounded-xl"
          style="background-color: color-mix(in oklch, var(--foreground) 2%, transparent)"
        >
          <p
            class="text-sm"
            style="color: var(--muted-foreground); opacity: 0.7"
          >
            {isOwner
              ? 'Ще немає відгуків. Перше замовлення виконано — і клієнти почнуть лишати відгуки.'
              : 'Ще немає відгуків'}
          </p>
        </div>
      {/if}
    </section>
  </div>
</article>
