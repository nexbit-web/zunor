<!--
  Профіль клієнта — Zunor. Преміум-картки, повністю на токенах теми.
  Production-grade:
  • Кольори лише через семантичні токени → коректна світла й темна теми.
  • Жодного inline style= → строга CSP. Стилі — Tailwind + одна .card.
  • Навігація — семантичні <a href> (prefetch, працює без JS), не <button onclick=goto>.
  • Валідний HTML: усередині інтерактивних елементів — лише дозволений контент.
  • Приватність (манифест): клієнт — не вітрина. Сторінка noindex, мікророзмітка мінімальна.
  • Надійність: усі гард-функції (formatDate/fmtRating/starCount/reviewsLabel/initials) 1:1.
  Залежності: lucide-svelte, $lib/components/ui/{avatar,skeleton}.
-->
<script lang="ts">
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import {
    MapPin,
    Calendar,
    Star,
    MessageSquare,
    User,
    Pencil,
    Repeat,
    Sparkles,
    ArrowRight,
  } from 'lucide-svelte'
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

  const created = $derived(
    formatDate(user.createdAt, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
  )
  const avgRatingLabel = $derived(fmtRating(user.avgRating))
  const reviewsLabelStr = $derived(reviewsLabel(user.reviews.length))
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
  <!-- Клієнт — приватний профіль, не вітрина (манифест). Не індексуємо. -->
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<article
  class="min-h-svh  p-2 pt-4 md:pb-12"
  itemscope
  itemtype="https://schema.org/Person"
>
  <div class="mx-auto flex max-w-150 flex-col gap-4">
    <!-- ═══ HEADER CARD ═══ -->
    <header class="card p-7">
      <div class="mb-4.5 flex items-start justify-between gap-4">
        <div class="relative">
          {#if user.avatar && !avatarLoaded}
            <div
              class="absolute inset-0 z-10 size-23 overflow-hidden rounded-full"
            >
              <Skeleton class="size-full rounded-full" />
            </div>
          {/if}
          <Avatar class="size-23 shadow-md ring-1 ring-border">
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
              class="cursor-default bg-secondary text-[34px] font-bold text-secondary-foreground"
            >
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>

        {#if isOwner}
          <a
            href="dashboard/settings/profile"
            class="inline-flex h-10.5 items-center gap-1.75 rounded-full bg-primary hover:bg-primary-hover px-4.5 text-[13.5px] font-semibold text-white transition-transform hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40 motion-reduce:transition-none"
          >
            <Pencil class="size-3.75 text-white" aria-hidden="true" /> Редагувати
          </a>
        {/if}
      </div>

      <h1
        class="mb-2 truncate text-[25px] font-bold tracking-[-0.03em] text-foreground"
        itemprop="name"
      >
        {user.name || 'Без імені'}
      </h1>

      <div class="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span
          class="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground"
        >
          <Calendar class="size-3.25" aria-hidden="true" />
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
            <MapPin class="size-3.25" aria-hidden="true" />
            <span itemprop="addressLocality">{user.city}</span>
          </span>
        {/if}
      </div>

      <!-- stat pills -->
      <div class="flex gap-2.5">
        <div class="flex-1 rounded-2xl bg-muted px-4 py-3.5">
          <div
            class="text-[20px] font-bold tracking-[-0.03em] text-foreground tabular-nums"
          >
            {user.totalOrders}
          </div>
          <div class="mt-0.5 text-xs text-muted-foreground">замовлень</div>
        </div>
        <div class="flex-1 rounded-2xl bg-muted px-4 py-3.5">
          <div
            class="text-[20px] font-bold tracking-[-0.03em] text-foreground tabular-nums"
          >
            {user.reviews.length}
          </div>
          <div class="mt-0.5 text-xs text-muted-foreground">
            {reviewsLabelStr}
          </div>
        </div>
        <div class="flex-1 rounded-2xl bg-muted px-4 py-3.5">
          <div
            class="inline-flex items-center gap-1.5 text-[20px] font-bold tracking-[-0.03em] text-foreground tabular-nums"
          >
            <Star
              class="size-3.75 fill-amber-400 text-amber-400"
              aria-hidden="true"
            />
            {avgRatingLabel}
          </div>
          <div class="mt-0.5 text-xs text-muted-foreground">рейтинг</div>
        </div>
      </div>

      <!-- badges -->
      <div class="mt-4 flex flex-wrap gap-2">
        <span
          class="inline-flex h-7.5 items-center rounded-full bg-secondary px-3.25 text-[12.5px] font-semibold text-secondary-foreground"
        >
          Клієнт
        </span>
        {#if user.completedOrders >= 10}
          <span
            class="inline-flex h-7.5 items-center gap-1.5 rounded-full bg-emerald-500/10 px-3.25 text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-400"
          >
            <Repeat class="size-3" aria-hidden="true" /> Постійний клієнт
          </span>
        {/if}
      </div>

      {#if isOwner}
        <a
          href="/welcome"
          class="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[14.5px] font-semibold text-background transition-transform hover:-translate-y-px active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40 motion-reduce:transition-none sm:hidden"
        >
          <Pencil class="size-4" aria-hidden="true" /> Редагувати профіль
        </a>
      {/if}
    </header>

    <!-- ═══ ABOUT ═══ -->
    {#if user.bio || isOwner}
      <section aria-labelledby="about-heading" class="card p-7">
        <h2
          id="about-heading"
          class="mb-4 inline-flex items-center gap-1.75 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
        >
          <User class="size-3.5" aria-hidden="true" /> Про себе
        </h2>
        {#if user.bio}
          <p
            class="text-[14.5px] leading-relaxed text-muted-foreground wrap-anywhere"
            itemprop="description"
          >
            {user.bio}
          </p>
        {:else}
          <p class="text-[14.5px] text-muted-foreground/60 italic">
            Ви ще не додали опис.
          </p>
        {/if}
      </section>
    {/if}

    <!-- ═══ REVIEWS ═══ -->
    <section aria-labelledby="reviews-heading" class="card p-7">
      <div class="mb-4.5 flex items-center justify-between">
        <h2
          id="reviews-heading"
          class="inline-flex items-center gap-1.75 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
        >
          <MessageSquare class="size-3.5" aria-hidden="true" /> Відгуки від майстрів
        </h2>
        {#if user.reviews.length > 0}
          <span
            class="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground"
          >
            <Star
              class="size-3 fill-amber-400 text-amber-400"
              aria-hidden="true"
            />
            <b class="font-semibold text-foreground">{avgRatingLabel}</b>
            · {user.reviews.length}
            {reviewsLabelStr}
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
              class="border-t border-border py-4.5 first:border-t-0 first:pt-0"
            >
              <div class="mb-2.5 flex items-center gap-2.5">
                <div
                  class="flex size-8.5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                  aria-hidden="true"
                >
                  {review.authorInitials}
                </div>
                <p
                  class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
                >
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
              <p
                class="pl-11 text-sm leading-relaxed text-muted-foreground wrap-anywhere"
              >
                {review.text}
              </p>
              <p class="mt-2 pl-11 text-[11.5px] text-muted-foreground/70">
                <time datetime={reviewDate.iso}>{reviewDate.display}</time>
              </p>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="rounded-2xl bg-muted py-8 text-center">
          <p class="text-sm text-muted-foreground">
            {isOwner
              ? 'Поки ще немає відгуків. Створіть першу заявку — і майстри почнуть лишати відгуки.'
              : 'Ще немає відгуків'}
          </p>
          {#if isOwner}
            <a
              href="/jobs/new"
              class="mt-2 inline-block rounded-sm text-xs font-semibold text-foreground transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
            >
              Створити заявку →
            </a>
          {/if}
        </div>
      {/if}
    </section>

    <!-- ═══ BECOME MASTER (тільки owner) ═══ -->
    {#if isOwner}
      <a
        href="/dashboard/onboarding/master"
        class="group flex w-full items-center justify-between gap-4 rounded-[28px] bg-primary p-5.5 text-left text-white shadow-[0_16px_40px_-16px_rgba(0,0,0,0.5)] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <span class="flex min-w-0 items-center gap-3.75">
          <span
            class="flex size-11.5 shrink-0 items-center justify-center rounded-[14px] bg-background/10"
          >
            <Sparkles class="size-5" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span class="min-w-0">
            <span class="block text-[15px] font-semibold"
              >Хочете заробляти?</span
            >
            <span class="mt-0.5 block text-[13px] text-white/90">
              Створіть профіль майстра і пропонуйте свої послуги.
            </span>
          </span>
        </span>
        <ArrowRight
          class="size-5 shrink-0 text-white/80 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </a>
    {/if}
  </div>
</article>

<style>
  /* Єдине джерело правди для картки. Тінь — alpha-чорний (працює в обох темах). */
  .card {
    border-radius: 28px;
    border: 1px solid var(--border);
    background-color: var(--card);
  }
</style>
