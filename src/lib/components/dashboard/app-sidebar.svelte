<script lang="ts">
  // Навігація дашборда на компонентах shadcn-svelte (ui/sidebar, блок
  // sidebar-07). Своєї розмітки панелі тут більше немає — від власного
  // сайдбара лишилась тільки ЛОГІКА: склад пунктів, роль, бейджі та
  // визначення активного рядка.
  //
  // Що це дало, крім однакового вигляду з рештою застосунку:
  //   • мобільна версія «безкоштовно» — на вузькому екрані панель сама
  //     стає шторкою (Sheet), тому окреме нижнє меню прибрано;
  //   • згорнутий стан і його cookie веде сам Sidebar.Provider
  //     (`sidebar_state`), нам не треба ні tween ширини, ні свого запису.
  //
  // Стан «згорнуто» приходить згори з cookie: компонент не знає, де саме
  // він зберігається, і не читає його сам.

  import type { Component } from 'svelte'
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { MediaQuery } from 'svelte/reactivity'
  import PanelLeftIcon from '@lucide/svelte/icons/panel-left'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import { useSidebar } from '$lib/components/ui/sidebar/index.js'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { notifications } from '$lib/notifications'
  import NavUser from './nav-user.svelte'
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

  const ICON_SIZE = 17
  const ICON_STROKE = 1.75

  const sidebar = useSidebar()

  const collapsed = $derived(sidebar.state === 'collapsed' && !sidebar.isMobile)

  /**
   * Пристрій із СПРАВЖНІМ ховером.
   *
   * На тачскрині `mouseenter` спрацьовує від дотику, а `mouseleave` не
   * приходить ніколи — панель назавжди лишилась би в стані «наведено»:
   * логотип зник би, а замість нього застигла б кнопка згортання.
   */
  const canHover = new MediaQuery('(hover: hover)')

  let hovering = $state(false)

  function toggle(): void {
    sidebar.toggle()
    // Ховер скидаємо явно: після згортання курсор лишається над панеллю,
    // і без цього на місці лого одразу висіла б кнопка.
    hovering = false
  }

  // ─── Сесія та роль ───

  type NavRole = 'CLIENT' | 'MASTER'

  const session = $derived(page.data.session)

  // Роль із layout-load (читана з БД), а НЕ з session.user.role: сесія
  // кешується в cookie на 5 хв, і свіжий майстер бачив би CLIENT.
  const role = $derived<NavRole>(
    page.data.role === 'MASTER' ? 'MASTER' : 'CLIENT',
  )

  // ─── Лічильники ───
  // Обидва — з єдиних сторів; власних Pusher-підписок панель не тримає.
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

<!-- collapsible="icon": на десктопі панель згортається в рейку з іконками,
     на вузькому екрані Sidebar сам показує себе шторкою.

     Обробники ховера їдуть у restProps і сідають на контейнер панелі —
     тобто ловлять наведення на ВСЮ панель, а не лише на логотип. Саме це
     й потрібно: у згорнутому стані курсор іде до рейки, а не цілиться в
     32 пікселі логотипа.

     На мобільному їх не передаємо взагалі: там Sidebar.Root рендерить не
     <div>, а Sheet.Root із bits-ui, і DOM-обробники в нього просто не
     ведуть — вони б мовчки нікуди не приєднались.

     mouseover, а НЕ mouseenter. mouseenter спрацьовує один раз на вхід у
     елемент, і після згортання панелі кнопкою (де ми скидаємо hovering)
     курсор лишався ВСЕРЕДИНІ панелі — новий вхід не наставав, і кнопка
     розгортання не зʼявлялась, доки не відвести мишу й повернути назад.
     Саме це й читалось як «іноді глючить». mouseover спливає з дітей і
     приходить на кожен рух, тож стан відновлюється одразу. Присвоєння
     того самого значення в $state реактивність не будить. -->
<Sidebar.Root
  collapsible="icon"
  {...sidebar.isMobile
    ? {}
    : {
        onmouseover: () => canHover.current && (hovering = true),
        onmouseleave: () => (hovering = false),
      }}
>
  <Sidebar.Header>
    <div class="flex h-8 items-center justify-between gap-2">
      <!-- Логотип і кнопка згортання займають одне місце: у згорнутій
           панелі на 34 корисних пікселі рейки більше нічого не влізе.
           Логотип гасне на ховері, кнопка проявляється поверх нього. -->
      <div class="relative flex size-8 shrink-0 items-center justify-center">
        <a
          href="/dashboard"
          aria-label="На головну"
          class="logo-link absolute inset-0 flex items-center justify-center overflow-hidden rounded-lg p-1"
          class:is-hidden={collapsed && hovering}
        >
          <ZunorMark />
        </a>

        <!-- aria-hidden + tabindex=-1, поки кнопка невидима: інакше Tab
             ловив би прихований контрол, а скрінрідер зачитував би його
             поруч із логотипом. -->
        <button
          type="button"
          onclick={toggle}
          aria-label="Розгорнути меню"
          aria-hidden={!collapsed}
          tabindex={collapsed ? 0 : -1}
          class="toggle-open absolute inset-0 flex items-center justify-center rounded-lg text-sidebar-foreground outline-none"
          class:is-visible={collapsed && hovering}
        >
          <PanelLeftIcon
            size={ICON_SIZE}
            strokeWidth={ICON_STROKE}
            aria-hidden="true"
          />
        </button>
      </div>

      <!-- У розгорнутій панелі місце є, тож кнопка стоїть окремо праворуч
           і ховатись їй нема потреби. -->
      {#if !collapsed}
        <button
          type="button"
          onclick={toggle}
          aria-label="Згорнути меню"
          class="toggle-close flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground outline-none"
        >
          <PanelLeftIcon
            size={ICON_SIZE}
            strokeWidth={ICON_STROKE}
            aria-hidden="true"
          />
        </button>
      {/if}
    </div>
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          {#each visibleItems as item (item.href)}
            {@const active = item.href === activeHref}
            {@const count = badgeCount(item)}
            {@const isAlert = item.badge === 'notifications'}

            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={active}
                tooltipContent={count > 0
                  ? `${item.label} (${count})`
                  : item.label}
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    aria-label={count > 0
                      ? `${item.label} — ${count}`
                      : item.label}
                  >
                    <span class="nav-icon relative flex shrink-0">
                      <item.icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />

                      <!-- Крапка на іконці — сигнал для ЗГОРНУТОЇ панелі.
                           Там числовий бейдж ховається (у нього немає
                           місця), а факт «є нове» показати треба, інакше
                           згорнута панель мовчить про непрочитане. -->
                      {#if count > 0}
                        <span
                          class="dot-badge absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-sidebar"
                          class:bg-destructive={isAlert}
                          class:bg-primary={!isAlert}
                          aria-hidden="true"
                        ></span>
                      {/if}
                    </span>
                    <span>{item.label}</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>

              {#if count > 0}
                <Sidebar.MenuBadge
                  class={isAlert
                    ? 'bg-destructive text-white'
                    : 'bg-primary text-primary-foreground'}
                >
                  {count > 9 ? '9+' : count}
                </Sidebar.MenuBadge>
              {/if}
            </Sidebar.MenuItem>
          {/each}
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>

  <Sidebar.Footer>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          isActive={settingsActive}
          tooltipContent="Налаштування"
        >
          {#snippet child({ props })}
            <a
              {...props}
              href="/dashboard/settings"
              aria-current={settingsActive ? 'page' : undefined}
            >
              <span class="nav-icon settings-icon-wrap flex shrink-0">
                <SettingsIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
              </span>
              <span>Налаштування</span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>

    <NavUser />
  </Sidebar.Footer>

  <!-- Sidebar.Rail тут свідомо НЕМАЄ.
       Це невидима смуга шириною 16px, яку блок sidebar-07 вішає ПОВЕРХ
       контенту праворуч від панелі (-right-4, z-20) і яка перемикає
       панель по кліку. З нашим перемикачем на логотипі вона зайва, а
       шкоду робить помітну: перехоплює кліки по лівому краю сторінки,
       підміняє курсор на resize там, де нічого не тягнеться, і дає
       «панель сама згорнулась» від випадкового кліку повз контент.
       Повертати її можна лише разом із приибиранням свого перемикача. -->
</Sidebar.Root>

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
    background-color: var(--sidebar-accent);
  }

  .toggle-close {
    transition: background-color 150ms ease;
  }
  .toggle-close:hover,
  .toggle-close:focus-visible {
    background-color: var(--sidebar-accent);
  }

  /* Inline SVG резервує місце під «хвостики» тексту як звичайний текст,
     через що всередині flex-центрування іконка з'їжджає на пару пікселів.
     display:block прибирає цей резерв. */
  .nav-icon :global(svg) {
    display: block;
  }

  /* Крапка потрібна лише в згорнутій панелі: у розгорнутій те саме число
     стоїть праворуч бейджем, і дві позначки про одне й те саме читаються
     як помилка. Клас панелі ставить сам Sidebar.Provider. */
  :global([data-collapsible='icon']) .dot-badge {
    display: block;
  }

  .dot-badge {
    display: none;
  }

  /* ─── Анімації іконок при наведенні ───
     Тригер на рядку меню, а не на самій іконці: курсор іде по рядку й у
     17 пікселів іконки майже ніколи не влучає. Селектор через :global,
     бо рядок малює Sidebar.MenuButton, а не наша розмітка. */

  :global(a:hover) > .nav-icon :global(.ring) {
    transform: rotate(90deg) scale(1.06);
  }
  :global(a:hover) > .nav-icon :global(.plus) {
    transform: scale(1.28);
  }

  :global(a:hover) > .nav-icon :global(.check) {
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

  :global(a:hover) > .nav-icon :global(.line) {
    animation: draw-line 400ms ease-out;
  }
  :global(a:hover) > .nav-icon :global(.line-2) {
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

  :global(a:hover) > .nav-icon :global(.dot) {
    transform-origin: center;
    animation: pulse-dot 600ms ease-in-out;
  }
  :global(a:hover) > .nav-icon :global(.dot-2) {
    animation-delay: 120ms;
    animation-fill-mode: both;
  }
  :global(a:hover) > .nav-icon :global(.dot-3) {
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

  :global(a:hover) > .nav-icon :global(.bell),
  :global(a:hover) > .nav-icon :global(.clapper) {
    transform-origin: 12px 4px;
  }
  :global(a:hover) > .nav-icon :global(.bell) {
    animation: swing-bell 700ms ease-in-out;
  }
  :global(a:hover) > .nav-icon :global(.clapper) {
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

  :global(a:hover) > .nav-icon :global(.bar) {
    transform-origin: center 17px;
    animation: grow-bar 380ms cubic-bezier(0.32, 0.72, 0, 1);
  }
  :global(a:hover) > .nav-icon :global(.bar-2) {
    animation-delay: 90ms;
    animation-fill-mode: both;
  }
  :global(a:hover) > .nav-icon :global(.bar-3) {
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

  :global(a:hover) > .settings-icon-wrap :global(svg) {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-icon :global(*) {
      animation: none !important;
    }
  }
</style>
