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
  //
  // Вигляд — за референсом у docs/ (скриншоти, обидві теми): панель
  // свого тону, відділена від сторінки лінією; пункти 40px зі
  // скругленням 8px, іконка кольору тексту; згорнута — рейка 56px з
  // квадратами 40px. Угорі знак Zunor і кнопка згортання, унизу —
  // налаштування, лінія й рядок користувача зі стрілкою. У рейці
  // розгортає сам знак: при наведенні він стає іконкою панелі.

  import type { Component } from 'svelte'
  import { onMount } from 'svelte'
  import { page } from '$app/state'
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
  import PanelLeftIcon from '$lib/components/icons/set/panel-left.svelte'
  import CloseIcon from '$lib/components/icons/set/x.svelte'
  import HelpIcon from '$lib/components/icons/set/circle-help.svelte'
  import ShieldIcon from '$lib/components/icons/set/shield-check.svelte'
  import { isStaff } from '$lib/admin/roles'
  import type { IconProps } from '$lib/components/icons/stroke-icon.svelte'

  const ICON_SIZE = 20
  const ICON_STROKE = 1.75

  // Рядок меню 40px, підпис 15px; у рейці — квадрат 40px без падінгу,
  // іконка по центру. Саме класами, а не правилом у стилях компонента: shadcn
  // ставить size-8! p-2!, а Tailwind 4 кладе утиліти в @layer, і для
  // !important шар перемагає будь-яке правило поза шаром. cn у
  // MenuButton (tailwind-merge) заміняє їхні класи цими.
  const MENU_BUTTON_CLASS =
    'h-10 gap-3 rounded-lg px-3 text-[15px] group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center'

  interface Props {
    /**
     * Панель відʼїхала за лівий край (налаштування — окремий екран зі
     * своїм меню). Стан «розгорнуто/згорнуто» і його cookie при цьому не
     * чіпаються: повернулись — панель така, як була.
     */
    away?: boolean
  }

  let { away = false }: Props = $props()

  const sidebar = useSidebar()

  // Згорнута панель — це рейка з іконками (collapsible="icon"), а не
  // порожнеча: навігація лишається під рукою, ховаються лише підписи.
  // На телефоні рейки немає взагалі — там панель шторка.
  const collapsed = $derived(sidebar.state === 'collapsed' && !sidebar.isMobile)

  const toggleLabel = $derived(
    sidebar.isMobile ? 'Закрити меню' : 'Згорнути меню',
  )

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
  const helpActive = $derived(pathname.startsWith('/dashboard/help'))
  // Вхід в адмінку — лише співробітникам (роль із бази, як і `role` вище).
  const staff = $derived(isStaff(page.data.role))

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

  // Клік по ПОРОЖНЬОМУ місцю рейки розгортає панель: ціль уся рейка, а
  // не лише 40px кнопки. Клік по пункту чи кнопці робить своє і панель
  // не чіпає. Клавіатурний шлях — кнопка на місці знака.
  function expandFromRail(event: MouseEvent): void {
    if (!collapsed || away) return
    if ((event.target as Element).closest('a, button')) return
    sidebar.setOpen(true)
  }
</script>

<!-- collapsible="icon": згорнута панель лишається вузькою рейкою з
     іконками, а не їде за край. variant="sidebar" (не inset): контент
     стоїть упритул до панелі без вікна й відступів, межу тримає лінія
     border-e кольору --sidebar-border. На вузькому екрані Sidebar
     показує себе шторкою, і жодне з цього там не діє. -->
<!-- data-away / inert лягають на контейнер панелі: відʼїхала — з неї
     не можна сфокусуватись Tab-ом і її не читає скрінрідер. onclick теж
     ліг на контейнер (Sidebar.Root віддає йому решту атрибутів). -->
<Sidebar.Root
  collapsible="icon"
  variant="sidebar"
  class="border-sidebar-border {sidebar.isMobile ? 'w-full! max-w-none!' : ''}"
  data-away={away || undefined}
  inert={away}
  onclick={expandFromRail}
>
  <Sidebar.Header>
    <!-- overflow-hidden: поки панель розгортається, кнопка згортання вже
         є в DOM, а ширини ще немає — без обрізання вона вилазила б на
         контент. -->
    <div class="flex h-10 items-center justify-between gap-2 overflow-hidden">
      {#if collapsed}
        <!-- У рейці на місці знака — кнопка розгортання. Наведення
             підміняє знак Zunor на іконку панелі: так видно, що це не
             просто логотип, а кнопка, і що саме вона зробить. -->
        <Tooltip.Root delayDuration={400}>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...mergeProps(props, { onclick: () => sidebar.setOpen(true) })}
                type="button"
                aria-label="Розгорнути меню"
                class="rail-toggle relative flex size-10 shrink-0 items-center justify-center rounded-lg outline-none"
              >
                <span class="rail-face rail-mark" aria-hidden="true">
                  <span class="logo-mark flex size-6"><ZunorMark /></span>
                </span>
                <span
                  class="rail-face rail-panel text-sidebar-foreground"
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
        <!-- Знак і назва. Знак — на тому самому місці, що й кнопка в
             рейці (px-2 = центр квадрата 40px), тож при згортанні він не
             стрибає, зникає лише назва. -->
        <a
          href="/dashboard"
          onclick={closeOnMobile}
          aria-label="На головну"
          class="logo-link flex h-10 min-w-0 items-center gap-2 rounded-lg px-2 pe-3"
        >
          <span class="logo-mark flex size-6 shrink-0"><ZunorMark /></span>
          <span class="truncate text-[19px] font-semibold tracking-[-0.02em]">
            Zunor
          </span>
        </a>

        <!-- Кнопка згортання — праворуч навпроти знака. На телефоні
             шторка займає весь екран, і там це саме «закрити»: хрестик
             читається однозначно, іконка панелі на весь екран — ні. -->
        <Tooltip.Root delayDuration={400}>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...mergeProps(props, { onclick: () => sidebar.toggle() })}
                type="button"
                aria-label={toggleLabel}
                class="panel-toggle flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-sidebar-foreground"
              >
                {#if sidebar.isMobile}
                  <CloseIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                {:else}
                  <PanelLeftIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                {/if}
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="bottom" sideOffset={6} arrowClasses="hidden">
            {toggleLabel}
          </Tooltip.Content>
        </Tooltip.Root>
      {/if}
    </div>
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupContent>
        <!-- Проміжок 2px між рядками однаковий у рейці й у розгорнутій
             панелі: при згортанні іконки не стрибають по вертикалі. -->
        <Sidebar.Menu class="gap-0.5">
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
                class={MENU_BUTTON_CLASS}
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
                <!-- top-2.5 і right-2 — під рядок 40px (shadcn рахує
                     позицію під 32px). -->
                <Sidebar.MenuBadge
                  class={[
                    'top-2.5! right-2',
                    isAlert
                      ? 'bg-destructive text-white'
                      : 'bg-primary text-primary-foreground',
                  ]}
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
    <Sidebar.Menu class="gap-0.5">
      {#if staff}
        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            class={MENU_BUTTON_CLASS}
            tooltipContent="Адмінка"
            tooltipContentProps={{ sideOffset: 8, arrowClasses: 'hidden' }}
          >
            {#snippet child({ props })}
              <a {...props} href="/admin" onclick={closeOnMobile}>
                <span class="nav-icon flex shrink-0">
                  <ShieldIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                </span>
                <span class="group-data-[collapsible=icon]:hidden">
                  Адмінка
                </span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      {/if}
      <!-- Допомога — біля налаштувань, а не серед розділів угорі: туди
           йдуть рідко, і в робочому меню вона була б шумом. -->
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          class={MENU_BUTTON_CLASS}
          isActive={helpActive}
          tooltipContent="Допомога"
          tooltipContentProps={{ sideOffset: 8, arrowClasses: 'hidden' }}
        >
          {#snippet child({ props })}
            <a
              {...props}
              href="/dashboard/help"
              aria-current={helpActive ? 'page' : undefined}
              onclick={closeOnMobile}
            >
              <span class="nav-icon flex shrink-0">
                <HelpIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
              </span>
              <span class="group-data-[collapsible=icon]:hidden">
                Допомога
              </span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          class={MENU_BUTTON_CLASS}
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
              <span class="nav-icon flex shrink-0">
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

    <!-- Лінія над рядком користувача — на всю ширину панелі (-mx-2 знімає
         падінг підвалу). У рейці її немає. -->
    <div
      class="-mx-2 border-t border-sidebar-border px-2 pt-2 group-data-[collapsible=icon]:border-t-0 group-data-[collapsible=icon]:pt-0"
    >
      <NavUser />
    </div>
  </Sidebar.Footer>

  <!-- Sidebar.Rail тут свідомо НЕМАЄ.
       Це невидима смуга шириною 16px, яку блок sidebar-07 вішає ПОВЕРХ
       контенту праворуч від панелі (-right-4, z-20) і яка перемикає
       панель по кліку. З нашими кнопками вона зайва, а шкоду робить
       помітну: перехоплює кліки по лівому краю сторінки, підміняє курсор
       на resize там, де нічого не тягнеться, і дає «панель сама
       згорнулась» від випадкового кліку повз контент. -->
</Sidebar.Root>

<style>
  .logo-mark :global(svg) {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .logo-link,
  .panel-toggle,
  .rail-toggle {
    transition:
      background-color 150ms ease,
      color 150ms ease;
  }
  .logo-link:hover,
  .logo-link:focus-visible,
  .panel-toggle:hover,
  .panel-toggle:focus-visible,
  .rail-toggle:hover,
  .rail-toggle:focus-visible {
    background-color: var(--sidebar-accent);
  }

  /* Кнопка розгортання в рейці: знак і іконка панелі лежать одне на
     одному, наведення чи фокус міняє їх місцями. */
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
  /* Тло — і на контейнері, не лише на внутрішньому шарі: лінія border-e
     напівпрозора (7%) і мусить лягати на тло ПАНЕЛІ, а не просвічувати
     сторінку. */
  :global([data-slot='sidebar-container']) {
    transition-property: left, right, width, transform;
    background-color: var(--sidebar);
  }

  /* Панель відʼїхала (налаштування): контейнер їде за лівий край на
     свою ширину — хоч розгорнутий, хоч рейка, — а розпірка стискається
     до нуля, і сторінка займає звільнене місце в тому ж русі. */
  /* overflow: зсув — рівно на ширину контейнера, і все, що вилазило б
     за його правий край, лишилось би видно біля краю вікна. */
  :global([data-slot='sidebar-container'][data-away]) {
    transform: translateX(-100%);
    overflow: hidden;
  }
  :global(
    [data-slot='sidebar']:has(> [data-slot='sidebar-container'][data-away])
      > [data-slot='sidebar-gap']
  ) {
    width: 0 !important;
  }

  /* Порожнє місце рейки клікабельне — розгортає панель (expandFromRail). */
  :global([data-collapsible='icon'] [data-slot='sidebar-container']) {
    cursor: pointer;
  }

  /* Активний пункт — нейтральна плашка (--sidebar-active), а не акцент:
     синій (чи будь-який обраний акцент) у меню перетягував на себе всю
     увагу. Вага шрифту та сама, що в решти пунктів, — «де я» видно з
     плашки. Ховер — світліший за активний (--sidebar-accent): активний
     рядок має лишатись помітнішим за той, над яким просто пройшла миша.

     Селектор — наявність атрибута, а не `='true'`: MenuButton ставить
     data-active порожнім рядком, і з `='true'` правило мовчки не
     спрацьовувало — активний пункт фарбував shadcn кольором ховера. */
  :global([data-slot='sidebar-menu-button'][data-active]:not([data-active='false'])) {
    background-color: var(--sidebar-active);
    color: var(--sidebar-foreground);
    font-weight: 400;
  }
  :global(
    [data-slot='sidebar-menu-button']:hover:not([data-active]:not([data-active='false']))
  ) {
    background-color: var(--sidebar-accent);
  }

  /* Крапка непрочитаного — тільки в рейці. У розгорнутій панелі поруч
     стоїть повноцінний бейдж із числом. Обвідка кольору панелі відділяє
     крапку від іконки. */
  .rail-dot {
    position: absolute;
    top: -2px;
    inset-inline-end: -3px;
    display: none;
    width: 8px;
    height: 8px;
    border-radius: 9999px;
    box-shadow: 0 0 0 2px var(--sidebar-raised);
  }
  :global([data-collapsible='icon']) .rail-dot {
    display: block;
  }

  /* Inline SVG резервує місце під «хвостики» тексту як звичайний текст,
     через що всередині flex-центрування іконка з'їжджає на пару пікселів.
     display:block прибирає цей резерв.

     Розмір задається ТУТ, а не лише атрибутом: sidebar-menu-button з
     shadcn жорстко ставить усім вкладеним svg `size-4`, і будь-який
     width/height на самій іконці мовчки перебивався б на 16px.

     Колір іконки — той самий, що в підпису (як у референсі), а не
     приглушений сірий. */
  .nav-icon :global(svg) {
    display: block;
    width: 20px;
    height: 20px;
  }
</style>
