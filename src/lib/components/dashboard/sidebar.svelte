<!-- src/lib/components/dashboard/sidebar.svelte
     Навігація дашборда. Стан «згорнуто» приходить згори з cookie,
     тому компонент не знає, де саме він зберігається. -->
<script lang="ts">
  import type { Component } from 'svelte'
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { Tween } from 'svelte/motion'
  import { MediaQuery } from 'svelte/reactivity'
  import { cubicInOut } from 'svelte/easing'
  import { fade } from 'svelte/transition'
  import { PanelLeft } from 'lucide-svelte'
  import * as Tooltip from '$lib/components/ui/tooltip/index.js'
  import * as Avatar from '$lib/components/ui/avatar/index.js'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { notifications } from '$lib/notifications'
  import { persistCollapsed } from './sidebar-state'
  import {
    JobsIcon,
    OrdersIcon,
    MessagesIcon,
    NotificationsIcon,
    AnalyticsIcon,
    SettingsIcon,
    NewJobIcon,
    ZunorMark,
  } from '$lib/components/icons'

  const COLLAPSED_WIDTH = 50
  const EXPANDED_WIDTH = 232

  /**
   * Один розмір на всі іконки панелі — щоб вони не розповзались.
   * Раніше кнопка згортання мала 15 при 17 у решти, а обгортка іконки
   * налаштувань була size-8 при size-8.5 у пунктів меню: у згорнутому
   * стані вона через це стояла на піксель лівіше за всі інші.
   *
   * 34px (size-8.5) — не випадкове число: згорнута панель має ширину 50
   * при px-2 з боків, тобто рівно 50 − 8 − 8 = 34 корисних пікселів.
   * Обгортка меншого розміру збиває іконку з центру рейки.
   */
  const ICON_SIZE = 17
  const ICON_STROKE = 1.75

  // Початкове значення приходить згори (cookie через layout).
  let { collapsed = $bindable(true) }: { collapsed?: boolean } = $props()

  let hovering = $state(false)

  /**
   * Пристрій із СПРАВЖНІМ ховером.
   *
   * На тачскрині `mouseenter` спрацьовує від дотику й `mouseleave` не
   * приходить ніколи — панель назавжди лишалась би в стані «наведено»:
   * у згорнутому вигляді логотип зник би, а замість нього застигла б
   * кнопка розгортання. Сайдбар видно з md і вище, тобто планшети сюди
   * потрапляють.
   */
  const canHover = new MediaQuery('(hover: hover)')

  /** Системна вимога «менше руху» — поважаємо і в анімації ширини теж. */
  const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)')

  /** 0 при reduced-motion: панель просто стрибає в потрібну ширину. */
  const motionMs = $derived(reducedMotion.current ? 0 : 120)

  // Tween.of, а не new Tween + $effect: ширина ЗАЛЕЖИТЬ від collapsed,
  // тобто це похідне значення, а не побічний ефект. Документований спосіб
  // у Svelte 5 — сам відстежує collapsed і не створює зайвого ефекту,
  // який ганяв би планувальник на кожному рендері компонента.
  const width = Tween.of(() => (collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH), {
    // Функція, а не число: Tween обчислює її на кожен перехід, тож
    // системне налаштування діє без перезавантаження сторінки.
    duration: () => (reducedMotion.current ? 0 : 380),
    easing: cubicInOut,
  })

  function toggleSidebar(): void {
    collapsed = !collapsed
    // Ховер скидаємо явно: після згортання курсор лишається над панеллю,
    // і без цього вона розкрилась би назад по hover.
    if (collapsed) hovering = false
    // Записуємо в обробнику, а не в $effect: зберігаємо рівно тоді,
    // коли людина сама перемкнула, без запису на першому рендері.
    persistCollapsed(collapsed)
  }

  // ─── Сесія та роль ───

  type NavRole = 'CLIENT' | 'MASTER'

  const session = $derived(page.data.session)

  // Роль із layout-load (читана з БД), а НЕ з session.user.role:
  // сесія кешується в cookie на 5 хв, і свіжий майстер бачив би CLIENT.
  const role = $derived<NavRole>(
    page.data.role === 'MASTER' ? 'MASTER' : 'CLIENT',
  )

  const user = $derived(
    session?.user
      ? {
          name: session.user.name ?? 'Користувач',
          avatar: session.user.image ?? '',
          initials: (session.user.name ?? 'U')[0].toUpperCase(),
        }
      : null,
  )

  // ─── Лічильники ───
  // Обидва — з єдиних сторів; власних Pusher-підписок сайдбар не тримає.
  const messageCount = $derived(chatStore.totalUnread)
  const notifCount = $derived(notifications.unreadCount)

  onMount(() => {
    if (!session?.user?.id || chatStore.initialized) return

    // Чати приходять із SSR лише на /messages, де вони — зміст сторінки.
    // На решті дашборда тягнемо їх один раз за сесію: далі список живе
    // на подіях Pusher, і жодна навігація більше не коштує запиту до БД.
    const ssrChats = page.data.chats
    if (ssrChats) chatStore.setChats(ssrChats)
    else chatStore.refreshChats()

    chatStore.subscribeToUserEvents(session.user.id).catch(() => {})
  })

  // ─── Навігація ───

  interface IconProps {
    size?: number
    strokeWidth?: number
    class?: string
  }

  type NavItem = {
    href: string
    label: string
    icon: Component<IconProps>
    /** Точний збіг шляху замість префікса — для /jobs/new проти /jobs. */
    exact?: boolean
    only?: NavRole
    labelByRole?: Partial<Record<NavRole, string>>
    badge?: 'messages' | 'notifications'
  }

  const NAV_ITEMS: readonly NavItem[] = [
    {
      href: '/dashboard/jobs/new',
      label: 'Нове замовлення',
      icon: NewJobIcon,
      exact: true,
      only: 'CLIENT', // майстри заявки не створюють
    },
    {
      href: '/dashboard/jobs',
      label: 'Мої заявки',
      labelByRole: { MASTER: 'Заявки поруч', CLIENT: 'Мої заявки' },
      icon: JobsIcon,
    },
    { href: '/dashboard/orders', label: 'Замовлення', icon: OrdersIcon },
    {
      href: '/dashboard/messages',
      label: 'Повідомлення',
      icon: MessagesIcon,
      badge: 'messages',
    },
    {
      href: '/dashboard/notifications',
      label: 'Сповіщення',
      icon: NotificationsIcon,
      badge: 'notifications',
    },
    {
      href: '/dashboard/analytics',
      label: 'Аналітика',
      icon: AnalyticsIcon,
      only: 'MASTER',
    },
  ]

  const visibleItems = $derived(
    NAV_ITEMS.filter((item) => !item.only || item.only === role).map(
      (item) => ({ ...item, label: item.labelByRole?.[role] ?? item.label }),
    ),
  )

  const pathname = $derived(page.url.pathname)
  const settingsActive = $derived(pathname.startsWith('/dashboard/settings'))

  // Активний пункт рахуємо один раз: інакше /dashboard/jobs/new
  // підсвічував би одночасно і «Нове замовлення», і «Мої заявки».
  // Серед префіксних збігів виграє найдовший.
  const activeHref = $derived.by(() => {
    const exact = NAV_ITEMS.find((i) => i.exact && pathname === i.href)
    if (exact) return exact.href

    return (
      NAV_ITEMS.filter(
        (i) =>
          !i.exact &&
          (pathname === i.href || pathname.startsWith(i.href + '/')),
      ).sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null
    )
  })

  function badgeCount(item: NavItem): number {
    if (item.badge === 'messages') return messageCount
    if (item.badge === 'notifications') return notifCount
    return 0
  }
</script>

{#snippet navLink(item: NavItem)}
  {@const active = item.href === activeHref}
  {@const count = badgeCount(item)}
  {@const isAlert = item.badge === 'notifications'}

  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <a
          {...props}
          href={item.href}
          aria-current={active ? 'page' : undefined}
          aria-label={count > 0 ? `${item.label} — ${count}` : item.label}
          class="row-item relative flex h-8 w-full shrink-0 items-center gap-2 rounded-lg pr-2 text-sidebar-foreground outline-none transition-colors"
          class:is-active={active}
        >
          <span
            class="nav-icon relative flex size-8.5 shrink-0 items-center justify-center"
          >
            <item.icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />

            <!-- У згорнутому стані лічильник — крапка на іконці:
                 місця під число немає, а факт «є нове» показати треба. -->
            {#if count > 0 && collapsed}
              <span
                class="absolute -top-0.5 -right-0.5 flex h-3.75 min-w-3.75 items-center justify-center rounded-full px-1 text-[9px] leading-none font-bold text-white ring-2 ring-background"
                class:bg-destructive={isAlert}
                class:bg-primary={!isAlert}
                aria-hidden="true"
              >
                {count > 9 ? '9+' : count}
              </span>
            {/if}
          </span>

          {#if !collapsed}
            <span
              class="min-w-0 flex-1 truncate text-sm"
              transition:fade={{ duration: motionMs }}
            >
              {item.label}
            </span>

            {#if count > 0}
              <span
                class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold text-white"
                class:bg-destructive={isAlert}
                class:bg-primary={!isAlert}
                transition:fade={{ duration: motionMs }}
                aria-hidden="true"
              >
                {count > 9 ? '9+' : count}
              </span>
            {/if}
          {/if}
        </a>
      {/snippet}
    </Tooltip.Trigger>

    <!-- Тултип лише в згорнутому стані: розгорнутий підпис і так видно. -->
    {#if collapsed}
      <Tooltip.Content side="right">
        <p>
          {item.label}{#if count > 0}&nbsp;({count}){/if}
        </p>
      </Tooltip.Content>
    {/if}
  </Tooltip.Root>
{/snippet}

<Tooltip.Provider delayDuration={200}>
  <aside
    aria-label="Бічне меню"
    data-collapsed={collapsed}
    class="sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-border px-2 py-3 md:flex"
    style:width="{width.current}px"
    onmouseenter={() => canHover.current && (hovering = true)}
    onmouseleave={() => (hovering = false)}
  >
    <!-- ─── Шапка: логотип / кнопка розгортання ─── -->
    <div class="flex h-8 w-full shrink-0 items-center justify-between">
      <div class="relative flex size-8 shrink-0 items-center justify-center">
        <a
          href="/dashboard"
          aria-label="На головну"
          class="logo-link absolute inset-0 flex items-center justify-center overflow-hidden rounded-lg p-1"
          class:is-hidden={collapsed && hovering}
        >
          <ZunorMark />
        </a>

        <!-- Кнопка проявляється поверх лого при ховері в згорнутому стані.
             aria-hidden + tabindex=-1, поки невидима: інакше Tab ловив би
             приховану кнопку, а скрінрідер зачитував би її поруч з лого. -->
        <button
          type="button"
          onclick={toggleSidebar}
          aria-label="Розгорнути меню"
          aria-hidden={!collapsed}
          tabindex={collapsed ? 0 : -1}
          class="toggle-open absolute inset-0 flex items-center justify-center rounded-lg text-sidebar-foreground outline-none"
          class:is-visible={collapsed && hovering}
        >
          <PanelLeft size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
        </button>
      </div>

      {#if !collapsed}
        <button
          type="button"
          onclick={toggleSidebar}
          aria-label="Згорнути меню"
          class="row-item flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground outline-none transition-colors"
          transition:fade={{ duration: motionMs }}
        >
          <PanelLeft size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
        </button>
      {/if}
    </div>

    <!-- ─── Основна навігація ─── -->
    <nav aria-label="Основне меню" class="mt-3 flex flex-col gap-1">
      {#each visibleItems as item (item.href)}
        {@render navLink(item)}
      {/each}
    </nav>

    <!-- ─── Низ: налаштування та профіль ─── -->
    <div class="mt-auto flex flex-col gap-1">
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <a
              {...props}
              href="/dashboard/settings"
              aria-current={settingsActive ? 'page' : undefined}
              class="row-item flex h-8 w-full shrink-0 items-center gap-2 overflow-hidden rounded-lg pr-2 text-sidebar-foreground outline-none transition-colors"
              class:is-active={settingsActive}
            >
              <span
                class="nav-icon settings-icon-wrap flex size-8.5 shrink-0 items-center justify-center"
              >
                <SettingsIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
              </span>
              {#if !collapsed}
                <span
                  class="min-w-0 flex-1 truncate text-sm"
                  transition:fade={{ duration: motionMs }}
                >
                  Налаштування
                </span>
              {/if}
            </a>
          {/snippet}
        </Tooltip.Trigger>
        {#if collapsed}
          <Tooltip.Content side="right"><p>Налаштування</p></Tooltip.Content>
        {/if}
      </Tooltip.Root>

      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <a
              {...props}
              href="/dashboard"
              aria-label="Мій профіль"
              class="row-item flex h-8 w-full items-center rounded-lg outline-none transition-colors"
              class:justify-center={collapsed}
              class:gap-2={!collapsed}
              class:pr-2={!collapsed}
            >
              <Avatar.Root class="size-7 shrink-0">
                <Avatar.Image src={user?.avatar ?? ''} alt="" />
                <Avatar.Fallback
                  class="bg-muted text-xs font-semibold text-foreground"
                >
                  {user?.initials ?? 'U'}
                </Avatar.Fallback>
              </Avatar.Root>
              {#if !collapsed}
                <span
                  class="min-w-0 flex-1 truncate text-sm"
                  transition:fade={{ duration: motionMs }}
                >
                  {user?.name ?? 'Користувач'}
                </span>
              {/if}
            </a>
          {/snippet}
        </Tooltip.Trigger>
        {#if collapsed}
          <Tooltip.Content side="right">
            <p>{user?.name ?? 'Користувач'}</p>
          </Tooltip.Content>
        {/if}
      </Tooltip.Root>
    </div>
  </aside>
</Tooltip.Provider>

<style>
  .logo-link :global(svg) {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .logo-link {
    opacity: 1;
    transition: opacity 150ms ease;
  }
  .logo-link.is-hidden {
    opacity: 0;
  }

  .row-item:hover {
    background-color: var(--accent);
  }
  .row-item.is-active {
    background-color: var(--accent);
    color: var(--accent-foreground);
  }

  .toggle-open {
    opacity: 0;
    pointer-events: none;
    background-color: transparent;
    transition:
      opacity 150ms ease,
      background-color 150ms ease;
  }
  .toggle-open.is-visible {
    opacity: 1;
    pointer-events: auto;
  }
  .toggle-open.is-visible:hover,
  .toggle-open:focus-visible {
    background-color: var(--accent);
  }

  /* Inline SVG резервує місце під «хвостики» тексту як звичайний текст,
     через що всередині flex-центрування іконка з'їжджає на пару пікселів.
     display:block прибирає цей резерв. */
  .nav-icon :global(svg) {
    display: block;
  }

  /* ─── Анімації іконок при наведенні на рядок ───
     Тригер на .row-item, а не на самій іконці: у сайдбарі курсор іде
     по рядку й у 17 пікселів іконки майже ніколи не влучає. */

  .row-item:hover .nav-icon :global(.ring) {
    transform: rotate(90deg) scale(1.06);
  }
  .row-item:hover .nav-icon :global(.plus) {
    transform: scale(1.28);
  }

  .row-item:hover .nav-icon :global(.check) {
    animation: draw-check 380ms ease-out;
  }
  @keyframes draw-check {
    from {
      stroke-dashoffset: 1;
      opacity: 0;
    }
    to {
      stroke-dashoffset: 0;
      opacity: 1;
    }
  }

  .row-item:hover .nav-icon :global(.line) {
    animation: draw-line 400ms ease-out;
  }
  .row-item:hover .nav-icon :global(.line-2) {
    animation-delay: 150ms;
    animation-fill-mode: both;
  }
  @keyframes draw-line {
    from {
      stroke-dashoffset: 1;
      opacity: 0;
    }
    to {
      stroke-dashoffset: 0;
      opacity: 1;
    }
  }

  .row-item:hover .nav-icon :global(.dot) {
    transform-origin: center;
    animation: pulse-dot 600ms ease-in-out;
  }
  .row-item:hover .nav-icon :global(.dot-2) {
    animation-delay: 120ms;
    animation-fill-mode: both;
  }
  .row-item:hover .nav-icon :global(.dot-3) {
    animation-delay: 240ms;
    animation-fill-mode: both;
  }
  @keyframes pulse-dot {
    0%,
    100% {
      transform: translateY(0) scale(1);
      opacity: 0.55;
    }
    40% {
      transform: translateY(-1.5px) scale(1.15);
      opacity: 1;
    }
  }

  .row-item:hover .nav-icon :global(.bell),
  .row-item:hover .nav-icon :global(.clapper) {
    transform-origin: 12px 4px;
  }
  .row-item:hover .nav-icon :global(.bell) {
    animation: swing-bell 700ms ease-in-out;
  }
  .row-item:hover .nav-icon :global(.clapper) {
    animation: swing-clapper 700ms ease-in-out;
  }
  @keyframes swing-bell {
    0%,
    100% {
      transform: rotate(0deg);
    }
    15% {
      transform: rotate(10deg);
    }
    35% {
      transform: rotate(-8deg);
    }
    55% {
      transform: rotate(5deg);
    }
    75% {
      transform: rotate(-2deg);
    }
  }
  @keyframes swing-clapper {
    0%,
    100% {
      transform: rotate(0deg);
    }
    20% {
      transform: rotate(14deg);
    }
    42% {
      transform: rotate(-11deg);
    }
    62% {
      transform: rotate(7deg);
    }
    80% {
      transform: rotate(-3deg);
    }
  }

  .row-item:hover .nav-icon :global(.bar) {
    transform-origin: center 17px;
    animation: grow-bar 380ms cubic-bezier(0.32, 0.72, 0, 1);
  }
  .row-item:hover .nav-icon :global(.bar-2) {
    animation-delay: 90ms;
    animation-fill-mode: both;
  }
  .row-item:hover .nav-icon :global(.bar-3) {
    animation-delay: 180ms;
    animation-fill-mode: both;
  }
  @keyframes grow-bar {
    from {
      transform: scaleY(0);
      opacity: 0;
    }
    to {
      transform: scaleY(1);
      opacity: 1;
    }
  }

  .row-item:hover .settings-icon-wrap :global(svg) {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .row-item:hover .nav-icon :global(*) {
      animation: none !important;
    }
  }
</style>
