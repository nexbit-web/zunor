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
  import PanelLeftIcon from '@lucide/svelte/icons/panel-left'
  import XIcon from '@lucide/svelte/icons/x'
  import { mergeProps } from 'bits-ui'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import * as Tooltip from '$lib/components/ui/tooltip/index.js'
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

  const ICON_SIZE = 19
  const ICON_STROKE = 1.75

  const sidebar = useSidebar()

  // Згорнута панель — це рейка з іконками (collapsible="icon"), а не
  // порожнеча: навігація лишається під рукою, ховаються лише підписи.
  // На телефоні рейки немає взагалі — там панель шторка.
  const collapsed = $derived(sidebar.state === 'collapsed' && !sidebar.isMobile)

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

  // Перехід за пунктом меню на телефоні закриває шторку: інакше вона
  // лишалась би поверх сторінки, на яку користувач щойно пішов.
  function closeOnMobile(): void {
    if (sidebar.isMobile) sidebar.setOpenMobile(false)
  }

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

<!-- collapsible="icon": згорнута панель лишається вузькою рейкою з
     іконками, а не їде за край. variant="inset": панель — частина рамки
     навколо скругленого блока з контентом. На вузькому екрані Sidebar
     показує себе шторкою, і жодне з цього там не діє. -->
<Sidebar.Root
  collapsible="icon"
  variant="inset"
  class={sidebar.isMobile ? 'w-full! max-w-none!' : ''}
>
  <Sidebar.Header>
    <!-- overflow-hidden: поки панель розгортається, назва вже є в DOM,
         а ширини ще немає — без обрізання текст вилазив би на контент. -->
    <div class="flex h-9 items-center justify-between gap-2 overflow-hidden">
      {#if collapsed}
        <!-- У рейці на місці лого — кнопка розгортання. Наведення
             підміняє знак Zunor на іконку панелі: так видно, що це не
             просто логотип, а кнопка, і що саме вона зробить. -->
        <Tooltip.Root delayDuration={400}>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...mergeProps(props, { onclick: () => sidebar.setOpen(true) })}
                type="button"
                aria-label="Розгорнути меню"
                class="rail-toggle relative flex size-9 shrink-0 items-center justify-center rounded-lg outline-none"
              >
                <span class="rail-face rail-mark" aria-hidden="true">
                  <span class="logo-mark flex size-6">
                    <ZunorMark />
                  </span>
                </span>
                <span
                  class="rail-face rail-panel text-primary"
                  aria-hidden="true"
                >
                  <PanelLeftIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                </span>
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="right" sideOffset={8} arrowClasses="hidden">
            Розгорнути меню
          </Tooltip.Content>
        </Tooltip.Root>
      {:else}
        <!-- Логотип із назвою — тільки у відкритій панелі. -->
        <a
          href="/dashboard"
          onclick={closeOnMobile}
          aria-label="На головну"
          class="logo-link flex min-w-0 items-center gap-2 rounded-lg p-1 pe-2"
        >
          <span
            class="logo-mark flex size-6 shrink-0 items-center justify-center"
          >
            <ZunorMark />
          </span>
          <span class="truncate text-[19px] font-semibold tracking-[-0.02em]">
            Zunor
          </span>
        </a>

        <!-- Кнопка закриття — праворуч у шапці, навпроти логотипа.
             На телефоні шторка займає весь екран, і там це саме «закрити»,
             а не «згорнути»: хрестик читається однозначно, іконка панелі
             на повний екран — ні.

             Тултип тут із тієї ж причини, що й на кнопці відкриття: у
             іконки без підпису інакше нема як пояснити, що вона зробить.
             На тачскріні він не спрацьовує — і не треба. -->
        <Tooltip.Root delayDuration={400}>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...mergeProps(props, { onclick: () => sidebar.toggle() })}
                type="button"
                aria-label={sidebar.isMobile ? 'Закрити меню' : 'Згорнути меню'}
                class="toggle-close flex size-8 shrink-0 items-center justify-center rounded-lg text-primary outline-none"
              >
                {#if sidebar.isMobile}
                  <XIcon
                    size={20}
                    strokeWidth={ICON_STROKE}
                    aria-hidden="true"
                  />
                {:else}
                  <PanelLeftIcon
                    size={ICON_SIZE}
                    strokeWidth={ICON_STROKE}
                    aria-hidden="true"
                  />
                {/if}
              </button>
            {/snippet}
          </Tooltip.Trigger>

          <Tooltip.Content side="bottom" sideOffset={6} arrowClasses="hidden">
            {sidebar.isMobile ? 'Закрити меню' : 'Згорнути меню'}
          </Tooltip.Content>
        </Tooltip.Root>
      {/if}
    </div>
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupContent>
        <!-- gap-0: рядки стоять упритул, підсвітка ховера тягнеться
             суцільною смугою. Проміжок розривав її на клапті. -->
        <Sidebar.Menu class="gap-0">
          {#each visibleItems as item (item.href)}
            {@const active = item.href === activeHref}
            {@const count = badgeCount(item)}
            {@const isAlert = item.badge === 'notifications'}

            <Sidebar.MenuItem>
              <!-- Тултип показується ЛИШЕ в рейці (так його вмикає сам
                   MenuButton): там пункт — сама іконка, і без підпису
                   доводиться вгадувати. У розгорнутій панелі підпис
                   написаний поруч, і тултип був би повтором. -->
              <Sidebar.MenuButton
                isActive={active}
                tooltipContent={item.label}
                tooltipContentProps={{ sideOffset: 8, arrowClasses: 'hidden' }}
              >
                {#snippet child({ props })}
                  <!-- preload «tap», а не «hover» з app.html: дані, взяті при
                       наведенні, SvelteKit віддає при кліку будь-коли пізніше
                       без перезапиту. Тут живі дані — стрічка без заявки, про
                       яку щойно прийшло сповіщення, виглядала як баг. -->
                  <a
                    {...props}
                    href={item.href}
                    onclick={closeOnMobile}
                    data-sveltekit-preload-data="tap"
                    aria-current={active ? 'page' : undefined}
                    aria-label={count > 0
                      ? `${item.label} — ${count}`
                      : item.label}
                  >
                    <span class="nav-icon relative flex shrink-0">
                      <item.icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                      <!-- У рейці числовий бейдж не вміщається, тож про
                           непрочитане каже крапка на самій іконці. -->
                      {#if count > 0}
                        <span
                          class="rail-dot {isAlert
                            ? 'bg-destructive'
                            : 'bg-primary'}"
                          aria-hidden="true"
                        ></span>
                      {/if}
                    </span>
                    <span class="group-data-[collapsible=icon]:hidden">
                      {item.label}
                    </span>
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
    <Sidebar.Menu class="gap-0">
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          isActive={settingsActive}
          tooltipContent="Налаштування"
          tooltipContentProps={{ sideOffset: 8, arrowClasses: 'hidden' }}
        >
          {#snippet child({ props })}
            <a
              {...props}
              href="/dashboard/settings"
              aria-current={settingsActive ? 'page' : undefined}
              onclick={closeOnMobile}
            >
              <span class="nav-icon settings-icon-wrap flex shrink-0">
                <SettingsIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
              </span>
              <span class="group-data-[collapsible=icon]:hidden">
                Налаштування
              </span>
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
  .logo-mark :global(svg) {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .logo-link {
    transition: background-color 150ms ease;
  }
  .logo-link:hover,
  .logo-link:focus-visible {
    background-color: var(--sidebar-accent);
  }

  /* Рух панелі. Крива — та сама, що в системних шторках Apple: різкий
     старт і довге мʼяке гальмування, тож проїзд читається як рух, а не
     як лінійне «переповзання» (ease-linear від shadcn).

     Обидва шари — і розпірка, і сама панель — мусять мати ОДНАКОВІ
     тривалість і криву, інакше контент і панель роз'їжджаються в русі. */
  :global([data-slot='sidebar-gap']),
  :global([data-slot='sidebar-container']) {
    transition-duration: 260ms;
    transition-timing-function: cubic-bezier(0.32, 0.72, 0, 1);
  }

  /* Ховер пункту — м'якший за підсвітку активного: активний рядок має
     лишатись помітнішим за той, над яким просто пройшла миша. Один і
     той самий колір на обох станах (як ставить sidebar-menu-button)
     робив наведення схожим на перехід. */
  :global([data-slot='sidebar-menu-button']:hover:not([data-active='true'])) {
    background-color: color-mix(
      in srgb,
      var(--sidebar-accent) 45%,
      transparent
    );
  }

  /* ─── Рейка ───
     Пункти в згорнутій панелі — квадрати 36px з іконкою по центру.
     Стандартні size-8 + p-2 від shadcn розраховані на іконку 16px, а в
     нас вона 19px і обрізалась би з правого краю. */
  /* Рамка навколо блока — 6px з усіх боків, і панель живе в ній же:
     контейнер має той самий падінг, що й відступ блока від вікна. */
  :global([data-variant='inset'] [data-slot='sidebar-container']) {
    padding: 6px;
  }

  /* У розгорнутій панелі групи shadcn додають ще 8px з кожного боку
     поверх рамки — пункти стояли далеко від краю. Лишаємо 4px. */
  :global([data-variant='inset'] [data-slot='sidebar-header']),
  :global([data-variant='inset'] [data-slot='sidebar-footer']),
  :global([data-variant='inset'] [data-slot='sidebar-group']) {
    padding-inline: 4px;
  }

  /* Рейка: один шар відступу, а не три. Рахуємо прямо в пікселях —
     6 + кнопка 36 + 6 = 48, і від кнопки до блока контенту ті самі 6px,
     що й зверху, знизу та праворуч від блока. Формула shadcn
     (--sidebar-width-icon + 16px + 2px) розрахована на падінг 8px і
     давала рейку на 20px ширшу. */
  :global([data-collapsible='icon'] [data-slot='sidebar-gap']),
  :global([data-collapsible='icon'] [data-slot='sidebar-container']) {
    width: 48px !important;
  }
  :global([data-collapsible='icon'] [data-slot='sidebar-header']),
  :global([data-collapsible='icon'] [data-slot='sidebar-footer']) {
    padding: 0;
  }
  :global([data-collapsible='icon'] [data-slot='sidebar-group']) {
    padding-inline: 0;
  }

  :global([data-collapsible='icon'] [data-slot='sidebar-menu-button']) {
    width: 36px !important;
    height: 36px !important;
    padding: 0 !important;
    justify-content: center;
  }

  .rail-toggle {
    transition: background-color 150ms ease;
  }
  .rail-toggle:hover,
  .rail-toggle:focus-visible {
    background-color: var(--sidebar-accent);
  }
  .rail-face {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 150ms ease;
  }
  .rail-panel {
    opacity: 0;
  }
  .rail-toggle:hover .rail-mark,
  .rail-toggle:focus-visible .rail-mark {
    opacity: 0;
  }
  .rail-toggle:hover .rail-panel,
  .rail-toggle:focus-visible .rail-panel {
    opacity: 1;
  }

  /* Крапка непрочитаного — тільки в рейці. У розгорнутій панелі поруч
     стоїть повноцінний бейдж із числом. */
  .rail-dot {
    position: absolute;
    top: -2px;
    inset-inline-end: -3px;
    display: none;
    width: 8px;
    height: 8px;
    border-radius: 9999px;
    box-shadow: 0 0 0 2px var(--sidebar);
  }
  :global([data-collapsible='icon']) .rail-dot {
    display: block;
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
     display:block прибирає цей резерв.

     Розмір задається ТУТ, а не лише атрибутом: sidebar-menu-button з
     shadcn жорстко ставить усім вкладеним svg `size-4`, і будь-який
     width/height на самій іконці мовчки перебивався б на 16px. */
  /* Іконка успадковує колір рядка (currentColor) — власного кольору в
     неї немає. Синім лишається ТІЛЬКИ активний пункт, і фарбує він
     одразу і підпис, і іконку: так у системних панелях (Finder), і так
     видно з першого погляду, де ти зараз. */
  a[aria-current='page'] {
    font-weight: 400;
    color: var(--primary);
  }
  .nav-icon :global(svg) {
    display: block;
    width: 19px;
    height: 19px;
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
