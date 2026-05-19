<!-- src/lib/components/profile/client-profile-view.svelte -->
<script lang="ts">
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import {
    Copy,
    Check,
    MapPin,
    Calendar,
    ShoppingBag,
    Star,
    MessageSquare,
    User,
    Pencil,
    Repeat,
    Sparkles,
    ArrowRight,
    Phone,
  } from 'lucide-svelte'
  import { goto } from '$app/navigation'
  import type { ClientProfileData } from '$lib/components/profile/types'

  interface Props {
    user: ClientProfileData
    isOwner: boolean
    isAuthenticated: boolean
  }

  let { user, isOwner }: Props = $props()

  // ─── Derived (memoized) ───
  const memberSinceLabel = $derived(
    new Date(user.createdAt).toLocaleDateString('uk-UA', {
      month: 'short',
      year: 'numeric',
    }),
  )

  const memberSinceISO = $derived(new Date(user.createdAt).toISOString())

  const avgRating = $derived(
    user.reviews.length > 0
      ? user.reviews.reduce((sum, r) => sum + r.rating, 0) / user.reviews.length
      : 0,
  )

  const avgRatingLabel = $derived(avgRating.toFixed(1))

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

  const reviewsLabelStr = $derived(reviewsLabel(user.reviews.length))

  // ─── State ───
  let avatarLoaded = $state(false)
  let usernameCopied = $state(false)
  let phoneCopied = $state(false)

  async function copyUsername() {
    if (!user.username) return
    try {
      await navigator.clipboard.writeText('@' + user.username)
      usernameCopied = true
      setTimeout(() => (usernameCopied = false), 1200)
    } catch {
      // ignore
    }
  }

  async function copyPhone() {
    if (!user.phone) return
    try {
      await navigator.clipboard.writeText(user.phone)
      phoneCopied = true
      setTimeout(() => (phoneCopied = false), 1200)
    } catch {
      // ignore
    }
  }

  function goEdit() {
    goto('/settings')
  }

  function becomeMaster() {
    goto('/onboarding')
  }
</script>

<article
  class="bg-background min-h-screen pb-24 sm:pb-12"
  itemscope
  itemtype="https://schema.org/Person"
>
  <div class="max-w-2xl mx-auto px-4 sm:px-8 pt-8 sm:pt-12">
    <!-- ═══════ Аватар + CTA ═══════ -->
    <header class="flex items-start justify-between mb-4 mt-1">
      <div class="relative">
        {#if user.avatar && !avatarLoaded}
          <div
            class="absolute inset-0 size-20 sm:size-24 rounded-full overflow-hidden z-10"
          >
            <Skeleton class="w-full h-full rounded-full" />
          </div>
        {/if}
        <Avatar class="size-20 sm:size-24 border-2 border-background">
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
            class="text-2xl sm:text-3xl font-semibold cursor-default"
            style="background-color: var(--secondary); color: var(--secondary-foreground)"
          >
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>

      {#if isOwner}
        <nav aria-label="Дії з профілем" class="hidden sm:flex gap-2 mt-2">
          <Button onclick={goEdit} class="h-9 rounded-full gap-1.5 text-sm">
            <Pencil class="size-3.5" aria-hidden="true" />
            Редагувати профіль
          </Button>
        </nav>
      {/if}
    </header>

    <!-- ═══════ Імʼя + статус ═══════ -->
    <section aria-label="Основна інформація" class="mb-6">
      <h1
        class="text-[18px] font-semibold truncate mb-1"
        style="color: var(--foreground)"
        itemprop="name"
      >
        {user.name || 'Без імені'}
      </h1>

      {#if user.username}
        <p
          class="text-xs flex items-center gap-1 mb-2"
          style="color: var(--muted-foreground)"
        >
          <span itemprop="alternateName">@{user.username}</span>
          <button
            type="button"
            onclick={copyUsername}
            class="cursor-pointer transition-colors hover:opacity-70"
            aria-label="Скопіювати нікнейм"
          >
            {#if usernameCopied}
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
          З <time datetime={memberSinceISO}>{memberSinceLabel}</time>
        </span>
        {#if user.city}
          <span
            class="text-xs"
            style="color: color-mix(in oklch, var(--muted-foreground) 40%, transparent)"
            aria-hidden="true">·</span
          >
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
          {user.totalOrders}
        </span>
        замовлень
        {#if user.reviews.length > 0}
          ·
          <span class="font-medium" style="color: var(--primary)">
            {user.reviews.length}
            {reviewsLabelStr}
          </span>
          ·
          <span style="color: #f5a623; font-weight: 500">
            ★ {avgRatingLabel}
          </span>
        {/if}
      </p>

      <!-- Бейджи -->
      <div class="flex flex-wrap gap-2">
        <Badge
          variant="outline"
          class="rounded-full text-xs font-normal px-3 py-1 cursor-default gap-1.5"
        >
          <ShoppingBag class="size-3" aria-hidden="true" />
          Клієнт
        </Badge>
        {#if user.completedOrders >= 10}
          <Badge
            variant="outline"
            class="rounded-full text-xs font-normal px-3 py-1 cursor-default gap-1.5"
          >
            <Repeat class="size-3" aria-hidden="true" />
            Постійний клієнт
          </Badge>
        {/if}
      </div>

      <!-- Mobile CTA -->
      {#if isOwner}
        <div class="flex sm:hidden mt-4">
          <Button onclick={goEdit} class="w-full h-11 rounded-full gap-2">
            <Pencil class="size-4" aria-hidden="true" />
            Редагувати профіль
          </Button>
        </div>
      {/if}
    </section>

    <div
      class="border-t"
      style="border-color: color-mix(in oklch, var(--foreground) 8%, transparent)"
    ></div>

    <!-- ═══════ Контакти (тільки owner) ═══════ -->
    {#if isOwner}
      <section aria-labelledby="contacts-heading" class="py-5 space-y-3">
        <h2
          id="contacts-heading"
          class="text-[11px] font-medium tracking-widest uppercase flex items-center gap-1.5"
          style="color: var(--muted-foreground)"
        >
          <Phone class="size-3.5" aria-hidden="true" /> Контакти
          <span
            class="font-normal text-[10px] normal-case tracking-normal ml-1"
            style="color: color-mix(in oklch, var(--muted-foreground) 60%, transparent)"
          >
            — видно тільки вам
          </span>
        </h2>

        {#if user.phone}
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p
                class="text-[10px] uppercase tracking-wider mb-0.5"
                style="color: var(--muted-foreground)"
              >
                Телефон
              </p>
              <p
                class="text-sm font-medium tabular-nums truncate"
                style="color: var(--foreground)"
              >
                {user.phone}
              </p>
            </div>
            <button
              type="button"
              onclick={copyPhone}
              class="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors cursor-pointer hover:opacity-70 shrink-0"
              style="background-color: var(--muted); color: var(--muted-foreground)"
              aria-label="Скопіювати телефон"
            >
              {#if phoneCopied}
                <Check
                  class="size-3"
                  style="color: #10b981"
                  aria-hidden="true"
                />
                Скопійовано
              {:else}
                <Copy class="size-3" aria-hidden="true" />
                Копіювати
              {/if}
            </button>
          </div>
        {:else}
          <p
            class="text-sm italic"
            style="color: var(--muted-foreground); opacity: 0.6"
          >
            Ви ще не додали телефон.
          </p>
        {/if}
      </section>

      <div
        class="border-t"
        style="border-color: color-mix(in oklch, var(--foreground) 8%, transparent)"
      ></div>
    {/if}

    <!-- ═══════ Про себе ═══════ -->
    {#if user.bio || isOwner}
      <section aria-labelledby="about-heading" class="py-5 space-y-3">
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
            Ви ще не додали опис.
          </p>
        {/if}
      </section>
      <div
        class="border-t"
        style="border-color: color-mix(in oklch, var(--foreground) 8%, transparent)"
      ></div>
    {/if}

    <!-- ═══════ Відгуки ═══════ -->
    <section aria-labelledby="reviews-heading" class="py-5">
      <div class="flex items-center justify-between mb-6">
        <h2
          id="reviews-heading"
          class="text-[11px] font-medium tracking-widest uppercase flex items-center gap-1.5"
          style="color: var(--muted-foreground)"
        >
          <MessageSquare class="size-3.5" aria-hidden="true" /> Відгуки від майстрів
        </h2>
        {#if user.reviews.length > 0}
          <span
            class="text-xs flex items-center gap-1"
            style="color: var(--muted-foreground)"
          >
            <Star
              class="size-3"
              style="color: #f5a623; fill: #f5a623"
              aria-hidden="true"
            />
            {avgRatingLabel} · {user.reviews.length}
            {reviewsLabelStr}
          </span>
        {/if}
      </div>

      {#if user.reviews.length > 0}
        <ul class="list-none p-0 m-0">
          {#each user.reviews as review, i (review.id ?? i)}
            <li
              class="py-5 first:pt-0"
              style="border-top: {i === 0
                ? 'none'
                : '1px solid color-mix(in oklch, var(--foreground) 5%, transparent)'}"
            >
              <div class="flex items-center gap-2 mb-2">
                <div
                  class="size-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                  style="background-color: var(--muted); color: var(--muted-foreground)"
                  aria-hidden="true"
                >
                  {review.authorInitials}
                </div>
                <div class="flex-1 min-w-0">
                  <p
                    class="text-sm font-medium truncate"
                    style="color: var(--foreground)"
                  >
                    {review.authorName}
                  </p>
                </div>
                <div
                  class="flex gap-0.5 shrink-0"
                  aria-label={`Рейтинг: ${review.rating} з 5`}
                >
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
                class="text-sm leading-relaxed pl-10"
                style="color: var(--muted-foreground); overflow-wrap: anywhere"
              >
                {review.text}
              </p>
              <p
                class="text-[11px] mt-2 pl-10"
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
              ? 'Поки ще немає відгуків. Створіть першу заявку — і майстри почнуть лишати відгуки.'
              : 'Ще немає відгуків'}
          </p>
          {#if isOwner}
            <button
              onclick={() => goto('/jobs/new')}
              class="text-xs mt-2 cursor-pointer transition-opacity hover:opacity-70 font-medium"
              style="color: var(--primary)"
            >
              Створити заявку →
            </button>
          {/if}
        </div>
      {/if}
    </section>

    <!-- ═══════ Стати майстром (тільки owner) ═══════ -->
    {#if isOwner}
      <div
        class="border-t"
        style="border-color: color-mix(in oklch, var(--foreground) 8%, transparent)"
      ></div>
      <aside class="py-6">
        <button
          type="button"
          onclick={becomeMaster}
          class="w-full flex items-center justify-between gap-4 p-5 rounded-xl border transition-all hover:opacity-90 cursor-pointer text-left"
          style="background-color: color-mix(in oklch, var(--primary) 5%, transparent);
                 border-color: color-mix(in oklch, var(--primary) 20%, transparent)"
        >
          <div class="flex items-center gap-4 min-w-0">
            <div
              class="size-11 rounded-full flex items-center justify-center shrink-0"
              style="background-color: color-mix(in oklch, var(--primary) 12%, transparent)"
            >
              <Sparkles
                class="size-5"
                style="color: var(--primary)"
                aria-hidden="true"
              />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-semibold" style="color: var(--foreground)">
                Хочете заробляти?
              </p>
              <p class="text-xs mt-0.5" style="color: var(--muted-foreground)">
                Створіть профіль майстра і пропонуйте свої послуги.
              </p>
            </div>
          </div>
          <ArrowRight
            class="size-5 shrink-0"
            style="color: var(--primary)"
            aria-hidden="true"
          />
        </button>
      </aside>
    {/if}
  </div>
</article>
