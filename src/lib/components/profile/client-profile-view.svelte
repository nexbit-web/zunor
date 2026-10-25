<!--
  Профіль замовника.

  Карток більше немає. Раніше кожен розділ жив у власній рамці зі
  скругленням 28px, і сторінка читалась як три різні віджети, складені
  один під одним. Розділи тут ідуть у природному порядку — хто це, про
  себе, відгуки — і їх достатньо відокремити повітрям та волосяною
  лінією: рамка навколо єдиної колонки не відділяє її ні від чого.

  Приватність (маніфест): клієнт — не вітрина. Сторінка noindex.
-->
<script lang="ts">
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import { Star, ChevronRight } from 'lucide-svelte'
  import type { ClientProfileData } from '$lib/components/profile/types'

  interface Props {
    user: ClientProfileData
    isOwner: boolean
    /** Зарезервовано: гейт для майбутніх дій залежно від автентифікації. */
    isAuthenticated: boolean
  }
  // isAuthenticated поки не використовується — не деструктуруємо, щоб не плодити warning.
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

  /** Українське відмінювання слова «замовлення». */
  function ordersLabel(n: number): string {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return 'замовлення'
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100))
      return 'замовлення'
    return 'замовлень'
  }

  const created = $derived(
    formatDate(user.createdAt, { month: 'long', year: 'numeric' }),
  )
  const hasReviews = $derived(user.reviews.length > 0)
  const avgRatingLabel = $derived(fmtRating(user.avgRating))
  const initials = $derived(
    (user.name ?? '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?',
  )

  let avatarLoaded = $state(false)
</script>

<svelte:head>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<article class="mx-auto w-full max-w-150 px-5 pt-10 pb-16">
  <!-- ═══ Хто це ═══ -->
  <header class="flex flex-col items-center text-center">
    <div class="relative">
      {#if user.avatar && !avatarLoaded}
        <div class="absolute inset-0 z-10 size-20 overflow-hidden rounded-full">
          <Skeleton class="size-full rounded-full" />
        </div>
      {/if}
      <Avatar class="size-20">
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
        {/if}
        <AvatarFallback
          class="cursor-default bg-muted text-2xl font-medium text-muted-foreground"
        >
          {initials}
        </AvatarFallback>
      </Avatar>
    </div>

    <h1 class="mt-4 text-2xl font-semibold">
      {user.name || 'Без імені'}
    </h1>

    <!-- Один рядок замість значка «Клієнт» і двох рядків з іконками:
         на власному профілі роль і так відома, а місто з датою —
         це підпис, а не дані, заради яких потрібні піктограми. -->
    <p class="mt-1 text-[15px] text-muted-foreground">
      {#if user.city}{user.city} ·
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

  <!-- ═══ Цифри ═══
       Без плашок: три числа в ряд самі читаються як таблиця, а сірі
       прямокутники навколо них лише додавали ваги там, де її не треба.
       Рейтинг показуємо тільки коли є з чого його рахувати — «0.0» під
       порожнім списком відгуків виглядає як погана оцінка. -->
  <div
    class="mt-8 grid grid-cols-3 divide-x divide-border/60 border-y border-border/60 py-5 text-center"
  >
    <div>
      <div class="text-[22px] font-semibold tabular-nums">
        {user.totalOrders}
      </div>
      <div class="mt-0.5 text-[13px] text-muted-foreground">
        {ordersLabel(user.totalOrders)}
      </div>
    </div>
    <div>
      <div class="text-[22px] font-semibold tabular-nums">
        {user.reviews.length}
      </div>
      <div class="mt-0.5 text-[13px] text-muted-foreground">
        {reviewsLabel(user.reviews.length)}
      </div>
    </div>
    <div>
      <div
        class="inline-flex items-center gap-1.5 text-[22px] font-semibold tabular-nums"
      >
        {#if hasReviews}
          <Star
            class="size-4 fill-amber-400 text-amber-400"
            aria-hidden="true"
          />
          {avgRatingLabel}
        {:else}
          <span class="text-muted-foreground">—</span>
        {/if}
      </div>
      <div class="mt-0.5 text-[13px] text-muted-foreground">рейтинг</div>
    </div>
  </div>

  <!-- ═══ Про себе ═══ -->
  {#if user.bio}
    <section aria-labelledby="about-heading" class="mt-8">
      <h2 id="about-heading" class="text-[15px] font-semibold">Про себе</h2>
      <p class="mt-2 leading-relaxed text-muted-foreground wrap-anywhere">
        {user.bio}
      </p>
    </section>
  {:else if isOwner}
    <section aria-labelledby="about-heading" class="mt-8">
      <h2 id="about-heading" class="text-[15px] font-semibold">Про себе</h2>
      <p class="mt-2 text-muted-foreground">
        Порожньо. Тут можна написати те, що майстру корисно знати заздалегідь.
      </p>
    </section>
  {/if}

  <!-- ═══ Відгуки ═══ -->
  <section aria-labelledby="reviews-heading" class="mt-8">
    <h2 id="reviews-heading" class="text-[15px] font-semibold">
      Відгуки від майстрів
    </h2>

    {#if hasReviews}
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
              <p class="min-w-0 flex-1 truncate text-[15px]">
                {review.authorName}
              </p>
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

            <p class="mt-2 leading-relaxed text-muted-foreground wrap-anywhere">
              {review.text}
            </p>
            <p class="mt-2 text-[13px] text-muted-foreground/70">
              <time datetime={reviewDate.iso}>{reviewDate.display}</time>
            </p>
          </li>
        {/each}
      </ul>
    {:else}
      <!-- Без сірої плашки: порожній список — це не помилка й не подія,
           на яку треба дивитись. -->
      <p class="mt-2 text-muted-foreground">
        {isOwner
          ? 'Майстри лишають відгук після виконаного замовлення.'
          : 'Ще немає відгуків'}
      </p>
      {#if isOwner}
        <a
          href="/dashboard/jobs/new"
          class="mt-2 inline-block text-primary underline-offset-4 transition-colors hover:text-primary-hover hover:underline"
        >
          Створити заявку
        </a>
      {/if}
    {/if}
  </section>

  <!-- ═══ Стати майстром ═══
       Рядок, а не синій банер: це пропозиція, а не головна дія екрана.
       Банер кольору primary перетягував на себе увагу з профілю. -->
  {#if isOwner}
    <a
      href="/dashboard/onboarding/master"
      class="mt-8 flex items-center justify-between gap-4 border-t border-border/60 pt-6 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span class="min-w-0">
        <span class="block text-[15px] font-semibold">Хочете заробляти?</span>
        <span class="mt-0.5 block text-[14px] text-muted-foreground">
          Створіть профіль майстра і пропонуйте свої послуги.
        </span>
      </span>
      <ChevronRight
        class="size-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </a>
  {/if}
</article>
