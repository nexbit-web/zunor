<!--
  Шапка публічних сторінок (лендинг, «Про нас», «Майстрам», профілі
  майстрів). На /dashboard її немає — там своя панель.

  Розміри — один в один із шапкою ClickUp (зняті з їхнього CSS):
  контейнер 1120px з полями 20px, смуга 14 + 32 + 14 = 60px, Inter 14px.
  Пункти — сірий текст вагою 500 на кнопці 32px з радіусом 8px, що
  підсвічується під курсором. Праворуч «Стати майстром» таким самим
  пунктом, сіра «Увійти» й чорна «Зареєструватися» — 32px, вага 600.
  Тло — біле на 90% з розмиттям 6px: сторінка під шапкою ледь просвічує.
  На лендингу шапка стоїть над першим екраном (його тло заходить під неї)
  і до прокрутки прозора — тло зʼявляється, щойно сторінку зрушили.

  «Послуги» розкривають широку панель на всю ширину контейнера, як
  меню ClickUp: смуга стає суцільною, під нею плитки послуг. Відкриття —
  наведенням мишею (із затримкою на закриття) і кліком: на дотик
  наведення немає. Закриття — Escape, клік повз, перехід.

  До 820px пункти й «Увійти» ховаються, лишаються «Зареєструватися» й
  гамбургер; меню на телефоні — на весь екран, великим кеглем.
-->
<script lang="ts">
  import { fade, slide } from 'svelte/transition'
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import ChevronDown from '$lib/components/icons/set/chevron-down.svelte'
  import X from '$lib/components/icons/set/x.svelte'
  import ServiceGlyph from '$lib/categories/cleaning/service-glyph.svelte'
  import ZunorMark from '$lib/components/icons/zunor-mark.svelte'
  import {
    LANDING_SERVICES,
    ORDER_HREF,
    ORDER_HREF_SIGNED_IN,
  } from '$lib/components/landing/content'
  import UserMenu from './user-menu.svelte'
  import Logo from './logo.svelte'

  const LINKS = [
    { href: '/#how', label: 'Як це працює' },
    { href: '/#faq', label: 'Питання' },
    { href: '/about', label: 'Про нас' },
  ]

  const isLoggedIn = $derived(!!page.data.session?.user)
  const orderHref = $derived(isLoggedIn ? ORDER_HREF_SIGNED_IN : ORDER_HREF)

  // Сторінки, чий перший екран заходить під шапку: там вона прозора, доки
  // сторінку не прокрутили. На сервері scrollY = 0 — тобто прозора, як і
  // буде на першому кадрі.
  const OVERLAY_PATHS = new Set(['/'])
  let scrollY = $state(0)
  const solid = $derived(
    !OVERLAY_PATHS.has(page.url.pathname) || scrollY > 4,
  )

  let root = $state<HTMLElement | null>(null)
  let servicesOpen = $state(false)
  let mobileOpen = $state(false)
  let mobileServices = $state(false)
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  afterNavigate(() => {
    servicesOpen = false
    mobileOpen = false
  })

  function hoverOpen(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return
    clearTimeout(closeTimer)
    servicesOpen = true
  }
  function hoverClose(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return
    closeTimer = setTimeout(() => (servicesOpen = false), 150)
  }

  function onDocPointer(e: PointerEvent) {
    if (servicesOpen && root && !root.contains(e.target as Node)) {
      servicesOpen = false
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    servicesOpen = false
    mobileOpen = false
  }

  // Без display у базових рядках: `hidden` на вузькому екрані інакше
  // сперечався б з `flex` у тому самому класі, і виграв би не той.
  /** Пункт меню ClickUp: 32px, 14/20, вага 500, сірий, підкладка під курсором. */
  const NAV_ITEM =
    'h-8 cursor-pointer items-center gap-1 rounded-[8px] px-2.5 text-[14px] leading-5 font-medium tracking-[-0.15px] whitespace-nowrap text-[#646464] transition-colors hover:bg-black/4 dark:text-[#b4b4b4] dark:hover:bg-white/10'
  /** Кнопки праворуч: 32px, 14/16, вага 600, радіус 8px. */
  const BUTTON =
    'h-8 items-center justify-center rounded-[8px] px-3 text-[14px] leading-4 font-semibold tracking-[-0.15px] whitespace-nowrap transition-colors'
  const LOGIN = `${BUTTON} bg-[#f0f0f0] text-black hover:bg-[#dedede] dark:bg-white/10 dark:text-[#eee] dark:hover:bg-white/15`
  /** Головна кнопка — пласка заливка акцентом, як у ui/button. */
  const ACCENT_FILL =
    'bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--primary)_88%,black)]'
  const SIGNUP = `${BUTTON} ${ACCENT_FILL}`
  /** Меню «Послуги»: заголовок колонки — моно, капітель, сірий. */
  const COLUMN_HEADER =
    'px-1.5 font-mono text-[14px] leading-4.5 font-medium tracking-[0.5px] text-[#838383] uppercase dark:text-[#7b7b7b]'
  const MENU_TITLE =
    'text-[14px] leading-5 font-medium tracking-[-0.15px] text-black dark:text-[#eee]'
  const MENU_TEXT =
    'text-[14px] leading-5 tracking-[-0.15px] text-[#646464] dark:text-[#b4b4b4]'
</script>

<svelte:document onpointerdown={onDocPointer} />
<svelte:window onkeydown={onKey} bind:scrollY />

<nav
  bind:this={root}
  class="sticky top-0 z-50 w-full"
  aria-label="Основна навігація"
>
  <!-- Тло окремим шаром, як у ClickUp: розмиття на самій смузі
       розмивало б і її вміст. З відкритим меню — суцільне. Прозора
       шапка — без розмиття теж: інакше по картинці під нею йшла б
       розмита смуга. -->
  <div
    class={[
      'absolute inset-0 transition-[background-color,backdrop-filter] duration-300',
      servicesOpen
        ? 'bg-background backdrop-blur-[6px]'
        : solid
          ? 'bg-background/90 backdrop-blur-[6px]'
          : 'bg-transparent',
    ]}
  ></div>

  <div
    class="relative mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 py-3.5 min-[1101px]:gap-13"
  >
    <div class="flex items-center gap-5">
      <Logo size="lg" />

      <div class="hidden items-center gap-2 min-[821px]:flex">
        <div
          role="presentation"
          onpointerenter={hoverOpen}
          onpointerleave={hoverClose}
        >
          <button
            type="button"
            class={[NAV_ITEM, 'flex', servicesOpen && 'bg-black/6 dark:bg-white/10']}
            aria-haspopup="true"
            aria-expanded={servicesOpen}
            aria-controls="services-menu"
            onclick={() => (servicesOpen = !servicesOpen)}
          >
            Послуги
            <ChevronDown
              class={[
                'size-3.5 transition-transform duration-200',
                servicesOpen && 'rotate-180',
              ]}
              strokeWidth={2.25}
              aria-hidden="true"
            />
          </button>
        </div>

        {#each LINKS as link (link.href)}
          <a href={link.href} class="{NAV_ITEM} flex">{link.label}</a>
        {/each}
      </div>
    </div>

    <div class="flex items-center gap-2.5">
      {#if isLoggedIn}
        <a href="/dashboard" class="{SIGNUP} flex">Кабінет</a>
        <UserMenu onnavigate={goto} />
      {:else}
        <a href="/master/about" class="{NAV_ITEM} hidden min-[1101px]:flex">
          Стати майстром
        </a>
        <a href="/user/login" class="{LOGIN} hidden min-[821px]:flex">Увійти</a>
        <a href="/user/register" class="{SIGNUP} flex">Зареєструватися</a>
      {/if}

      <!-- Гамбургер — три риски 2px, як у ClickUp, а не іконка. -->
      <button
        type="button"
        class="flex size-8 cursor-pointer flex-col justify-between p-2 min-[821px]:hidden"
        aria-label="Відкрити меню"
        aria-expanded={mobileOpen}
        aria-controls="mobile-menu"
        onclick={() => (mobileOpen = true)}
      >
        <span class="h-0.5 w-full rounded-[1px] bg-[#646464]"></span>
        <span class="h-0.5 w-full rounded-[1px] bg-[#646464]"></span>
        <span class="h-0.5 w-full rounded-[1px] bg-[#646464]"></span>
      </button>
    </div>
  </div>

  <!-- Меню «Послуги» — на всю ширину контейнера під смугою. -->
  {#if servicesOpen}
    <div
      id="services-menu"
      role="presentation"
      class="absolute inset-x-0 top-full bg-background pb-8 shadow-[0_10px_15px_-3px_#0000001a,0_4px_6px_-4px_#0000001a] dark:shadow-[0_10px_15px_-3px_#00000066]"
      transition:slide={{ duration: 220 }}
      onpointerenter={hoverOpen}
      onpointerleave={hoverClose}
    >
      <div class="mx-auto flex max-w-[1120px] items-stretch">
        <!-- Послуги — дві колонки по три, з великими іконками -->
        <div class="menu-col flex min-w-0 flex-1 flex-col gap-3 px-3.5 py-4">
          <p class={COLUMN_HEADER}>Послуги</p>
          <ul class="grid grid-cols-2 gap-x-6 gap-y-3">
            {#each LANDING_SERVICES as s (s.key)}
              <li>
                <a
                  href={orderHref}
                  class="group flex items-center gap-3 rounded-[12px] p-1.5 transition-colors hover:bg-black/4 dark:hover:bg-white/11"
                  style="--tint: {s.tint}"
                >
                  <ServiceGlyph
                    service={s.key}
                    class="size-10 shrink-0 text-[#202020] transition-colors duration-200 group-hover:text-(--tint) dark:text-[#eee]"
                  />
                  <span class="h-10 min-w-0 flex-1">
                    <span class="block {MENU_TITLE}">{s.label}</span>
                    <span class="block truncate {MENU_TEXT}">{s.short}</span>
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        </div>

        <!-- Картка праворуч — як «Customer stories» у меню ClickUp:
             для тих, хто не знає, яке прибирання обрати. -->
        <div class="menu-col flex w-80 shrink-0 flex-col px-3.5 py-4">
          <a
            href={orderHref}
            class="flex flex-1 flex-col gap-4 rounded-[12px] bg-[#f8f9fa] p-5 transition-colors hover:bg-black/9 dark:border dark:border-[#2a2a2a] dark:bg-transparent dark:hover:bg-white/5"
          >
            <span class="flex items-center gap-3">
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-[#202020] text-white dark:bg-[#eee] dark:text-[#111]"
              >
                <ZunorMark class="h-5 w-auto" />
              </span>
              <span class="min-w-0">
                <span class="block {MENU_TITLE}">Асистент Zunor</span>
                <span class="block {MENU_TEXT}">Підкаже, що обрати</span>
              </span>
            </span>
            <span
              class="text-[18px] leading-6 font-medium tracking-[-0.15px] text-[#202020] dark:text-[#eee]"
            >
              Не знаєш, яке саме прибирання? Просто опиши задачу своїми
              словами.
            </span>
            <span
              class="mt-auto text-[14px] leading-5 font-semibold tracking-[-0.15px] text-[#202020] dark:text-[#eee]"
            >
              Описати задачу →
            </span>
          </a>
        </div>
      </div>
    </div>
  {/if}
</nav>

<!-- Меню на телефоні — на весь екран, як у ClickUp: своя смуга з лого
     й хрестиком, пункти великим кеглем, дії внизу. -->
{#if mobileOpen}
  <div
    id="mobile-menu"
    class="fixed inset-0 z-60 flex h-svh flex-col bg-background min-[821px]:hidden"
    transition:fade={{ duration: 150 }}
  >
    <div
      class="flex items-center justify-between border-b border-[#e8e8e8] px-5 py-3.5 dark:border-[#2a2a2a]"
    >
      <Logo size="lg" />
      <button
        type="button"
        class="flex size-8 cursor-pointer items-center justify-center rounded-[8px] text-foreground transition-colors hover:bg-black/4 dark:hover:bg-white/10"
        aria-label="Закрити меню"
        onclick={() => (mobileOpen = false)}
      >
        <X class="size-4.5" aria-hidden="true" />
      </button>
    </div>

    <div class="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3">
      <button
        type="button"
        class="flex w-full cursor-pointer items-center justify-between rounded-[6px] p-2.5 text-left text-[26px] leading-[1.25] font-[650] tracking-[-0.91px] transition-colors hover:bg-black/4 dark:hover:bg-white/8"
        aria-expanded={mobileServices}
        onclick={() => (mobileServices = !mobileServices)}
      >
        Послуги
        <ChevronDown
          class={[
            'size-6 text-[#646464] transition-transform duration-200',
            mobileServices && 'rotate-180',
          ]}
          aria-hidden="true"
        />
      </button>
      {#if mobileServices}
        <ul class="flex flex-col gap-3 px-2.5 pb-3" transition:slide={{ duration: 180 }}>
          {#each LANDING_SERVICES as s (s.key)}
            <li>
              <a
                href={orderHref}
                class="flex items-center gap-3 rounded-[6px] p-1.5 transition-colors hover:bg-black/4 dark:hover:bg-white/8"
              >
                <ServiceGlyph service={s.key} class="size-10 shrink-0" />
                <span class="min-w-0">
                  <span
                    class="block text-[18px] leading-6 font-medium tracking-[-0.15px]"
                  >
                    {s.label}
                  </span>
                  <span class="block {MENU_TEXT}">{s.short}</span>
                </span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}

      {#each [...LINKS, { href: '/master/about', label: 'Стати майстром' }] as link (link.href)}
        <a
          href={link.href}
          class="flex w-full items-center rounded-[6px] p-2.5 text-[26px] leading-[1.25] font-[650] tracking-[-0.91px] transition-colors hover:bg-black/4 dark:hover:bg-white/8"
        >
          {link.label}
        </a>
      {/each}
    </div>

    <div
      class="flex flex-col gap-2.5 border-t border-[#e8e8e8] p-5.5 dark:border-[#2a2a2a]"
    >
      {#if isLoggedIn}
        <a
          href="/dashboard"
          class="flex items-center justify-center rounded-[8px] px-5 py-3.5 text-[18px] leading-6 font-[650] tracking-[-0.36px] {ACCENT_FILL}"
        >
          Кабінет
        </a>
      {:else}
        <a
          href="/user/login"
          class="flex items-center justify-center rounded-[8px] bg-[#f0f0f0] px-5 py-3.5 text-[18px] leading-6 font-[650] tracking-[-0.36px] text-[#646464] dark:bg-white/10 dark:text-[#eee]"
        >
          Увійти
        </a>
        <a
          href="/user/register"
          class="flex items-center justify-center rounded-[8px] px-5 py-3.5 text-[18px] leading-6 font-[650] tracking-[-0.36px] {ACCENT_FILL}"
        >
          Зареєструватися
        </a>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Вміст колонок проявляється слідом за «завісою», як у ClickUp. */
  .menu-col > :global(*) {
    animation: menu-col-in 260ms ease-out 60ms backwards;
  }
  @keyframes menu-col-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .menu-col > :global(*) {
      animation: none;
    }
  }
</style>
