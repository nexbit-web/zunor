<script lang="ts">
  // Каркас налаштувань: картка профілю + рейка розділів + контент.
  // На вузьких екранах рейка стає горизонтальною смугою вкладок —
  // простіше за drill-down з iOS і не потребує стану переходів.

  import { page } from '$app/state'
  import { sectionsForRole } from '$lib/components/settings'

  let { children } = $props()

  const activeSlug = $derived(
    page.url.pathname.split('/').filter(Boolean).at(-1) ?? '',
  )

  const user = $derived(page.data.session?.user)
  const isProfileActive = $derived(activeSlug === 'profile')

  // Ініціал як запасний аватар: у Google-акаунтів фото є завжди,
  // у зареєстрованих поштою — ні.
  const initial = $derived(
    (user?.name ?? user?.email ?? '?').charAt(0).toUpperCase(),
  )

  const roleLabel = $derived(
    page.data.role === 'MASTER' ? 'Виконавець' : 'Замовник',
  )

  const sections = $derived(sectionsForRole(page.data.role ?? null))
</script>

<svelte:head><title>Налаштування · Zunor</title></svelte:head>

<div class="mx-auto w-full max-w-4xl px-4 py-8">
  <div class="flex flex-col gap-6 md:flex-row md:gap-8">
    <div class="shrink-0 md:sticky md:top-8 md:w-48 md:self-start">
      <h1 class="mb-5 text-xl font-semibold tracking-[-0.02em]">
        Налаштування
      </h1>
      <!-- ─── Картка профілю ───
           Аватар більший за плитки розділів: акаунт — не такий самий
           пункт списку, а те, до чого решта налаштувань належить. -->
      <a
        href="/dashboard/settings/profile"
        aria-current={isProfileActive ? 'page' : undefined}
        class="mb-1 flex items-center gap-3 rounded-lg p-2 transition-colors {isProfileActive
          ? 'bg-accent'
          : 'hover:bg-accent/50'}"
      >
        {#if user?.image}
          <img
            src={user.image}
            alt=""
            class="size-9 shrink-0 rounded-full object-cover"
          />
        {:else}
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground"
          >
            {initial}
          </span>
        {/if}

        <span class="min-w-0">
          <span class="block truncate text-[13.5px] font-medium">
            {user?.name ?? 'Профіль'}
          </span>
          <span class="block truncate text-[11.5px] text-muted-foreground">
            {roleLabel}
          </span>
        </span>
      </a>

      <!-- ─── Рейка розділів ─── -->
      <nav
        class="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0"
        aria-label="Розділи налаштувань"
      >
        {#each sections as section (section.slug)}
          {@const isActive = activeSlug === section.slug}
          <a
            href="/dashboard/settings/{section.slug}"
            aria-current={isActive ? 'page' : undefined}
            class="flex shrink-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] whitespace-nowrap transition-colors {isActive
              ? 'bg-accent font-medium text-accent-foreground'
              : 'text-foreground/80 hover:bg-accent/50'}"
          >
            <span
              class="flex size-[22px] shrink-0 items-center justify-center rounded-[6px] text-white {section.tile}"
            >
              <section.icon size={13} strokeWidth={2} aria-hidden="true" />
            </span>
            {section.label}
          </a>
        {/each}
      </nav>
    </div>

    <!-- Контент розділу -->
    <div class="min-w-0 flex-1">
      {@render children()}
    </div>
  </div>
</div>
