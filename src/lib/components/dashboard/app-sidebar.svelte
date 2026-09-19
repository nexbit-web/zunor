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
  import { onMount, onDestroy } from 'svelte'
  import { MediaQuery } from 'svelte/reactivity'
  import { page } from '$app/state'
  import PanelLeftIcon from '@lucide/svelte/icons/panel-left'
  import XIcon from '@lucide/svelte/icons/x'
  import { mergeProps } from 'bits-ui'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import * as Tooltip from '$lib/components/ui/tooltip/index.js'
  import { useSidebar } from '$lib/components/ui/sidebar/index.js'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { settingsDialog } from '$lib/stores/settings-dialog.svelte'
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

  // Панель зачинена НАСПРАВДІ (offcanvas), тож на її місці нічого не
  // лишається — кнопку відкриття треба малювати поверх контенту.
  const hidden = $derived(!sidebar.open && !sidebar.isMobile)

  // ─── Підглядання (peek) ───
  //
  // Наведення на кнопку показує панель ПОВЕРХ сторінки, не рухаючи
  // контент: подивитись у меню — не те саме, що відкрити його, і за
  // побіжний погляд не має розʼїжджатись уся сторінка. Клік уже
  // закріплює панель по-справжньому, і тоді контент посувається.
  //
  // Пристрій зі СПРАВЖНІМ ховером: на тачскріні mouseenter приходить від
  // дотику, а mouseleave не приходить ніколи — панель залипла б
  // напіввідкритою назавжди.
  const canHover = new MediaQuery('(hover: hover)')

  let peeking = $state(false)

  // Окремий прапорець для ВИГЛЯДУ шапки. Одного `peeking` мало: коли
  // курсор іде геть, панель ще 260 мс їде за край, а лого з назвою
  // спалахували б у ній просто тому, що підглядання вже скінчилось.
  // Тому шапка лишається порожньою ще трохи ПІСЛЯ того, як панель
  // рушила назад — рівно доти, доки її видно.
  let peekChrome = $state(false)
  let chromeTimer: ReturnType<typeof setTimeout> | undefined

  // Не $state: використовується лише всередині обробників і таймера,
  // перемальовувати через нього нічого не треба.
  let overPanel = false
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  function peekOpen(): void {
    if (!canHover.current || sidebar.isMobile) return
    clearTimeout(closeTimer)
    clearTimeout(chromeTimer)
    peeking = true
    peekChrome = true
  }

  // Курсор із кнопки йде РІВНО на панель, яка щойно наїхала зверху, і
  // порядок подій тут — спершу mouseleave кнопки, аж потім mouseenter
  // панелі. Без цієї паузи панель встигала б зникнути між ними.
  function peekCloseSoon(): void {
    clearTimeout(closeTimer)
    closeTimer = setTimeout(() => {
      if (!overPanel) peeking = false
    }, 120)
  }

  function peekEnd(): void {
    clearTimeout(closeTimer)
    overPanel = false
    peeking = false

    // 300 мс > 260 мс проїзду: лого проявляється вже за краєм екрана.
    clearTimeout(chromeTimer)
    chromeTimer = setTimeout(() => (peekChrome = false), 300)
  }

  function pinSidebar(): void {
    peekEnd()

    // Клік — це вже справжнє відкриття: лого з назвою мають бути на
    // місці одразу, чекати на них нема чого.
    clearTimeout(chromeTimer)
    peekChrome = false

    sidebar.setOpen(true)
  }

  onDestroy(() => {
    clearTimeout(closeTimer)
    clearTimeout(chromeTimer)
  })

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

  // Налаштування відкриваються модалкою поверх поточної сторінки, тому
  // звичайний клік по посиланню перехоплюємо. Модифікатори й середню
  // кнопку не чіпаємо: це «відкрити в новій вкладці», і там має
  // спрацювати справжній маршрут.
  function openSettings(event: MouseEvent): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (event.button !== 0) return

    event.preventDefault()

    // На телефоні панель — шторка поверх сторінки: лишити її відкритою
    // під модалкою означає два накладені шари.
    closeOnMobile()

    settingsDialog.show()
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

<!-- Кнопка відкриття для десктопа. Панель зачиняється повністю, тож
     перемикача на її місці не лишається — як у Finder і в Claude, кнопка
     переїжджає в лівий верхній кут над контентом.

     Плаваюча, а не в шапці: окремої шапки на дашборді немає навмисно, і
     заводити цілу смугу заради однієї кнопки означало б мінус рядок
     контенту на кожному екрані.

     Лічильник на ній той самий, що й на мобільній кнопці: із зачиненою
     панеллю все непрочитане ховається разом із нею. -->
<Tooltip.Root delayDuration={400}>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <!-- mergeProps, а не голий spread: свої обробники поверх
           тултипових просто затерли б їх, і підказка не зʼявлялась би
           узагалі. -->
      <button
        {...mergeProps(props, {
          onclick: pinSidebar,
          onmouseenter: peekOpen,
          onmouseleave: peekCloseSoon,
        })}
        type="button"
        aria-label={messageCount + notifCount > 0
          ? `Відкрити меню — ${messageCount + notifCount} непрочитаних`
          : 'Відкрити меню'}
        aria-hidden={!hidden}
        tabindex={hidden ? 0 : -1}
        class="open-panel fixed start-3 top-3 z-50 hidden size-9 items-center justify-center rounded-lg text-primary outline-none md:flex"
        class:is-visible={hidden}
      >
        <PanelLeftIcon size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />

        {#if messageCount + notifCount > 0}
          <span
            class="absolute -end-0.5 -top-0.5 size-2 rounded-full bg-destructive ring-2 ring-background"
            aria-hidden="true"
          ></span>
        {/if}
      </button>
    {/snippet}
  </Tooltip.Trigger>

  <!-- Тултип лишається саме тут: підпису в кнопки немає, і без підказки
       про іконку доводиться здогадуватись. Затримка більша за типову,
       щоб підказка не вистрибувала при кожному русі повз кут. -->
  <Tooltip.Content side="bottom" sideOffset={6} arrowClasses="hidden">
    Відкрити меню
  </Tooltip.Content>
</Tooltip.Root>

<!-- collapsible="offcanvas": на десктопі панель їде за край екрана
     повністю, а не лишається рейкою з іконками. На вузькому екрані
     Sidebar так само показує себе шторкою.

     Клас з обробниками їдуть у restProps і сідають на контейнер панелі.
     На мобільному не передаємо взагалі: там Sidebar.Root рендерить не
     <div>, а Sheet.Root із bits-ui, і DOM-обробники в нього просто не
     ведуть — вони б мовчки нікуди не приєднались. -->
<Sidebar.Root
  collapsible="offcanvas"
  class={sidebar.isMobile
    ? 'w-full! max-w-none!'
    : hidden && peeking
      ? 'peek'
      : ''}
  {...sidebar.isMobile
    ? {}
    : {
        onmouseenter: () => {
          overPanel = true
          clearTimeout(closeTimer)
        },
        onmouseleave: peekEnd,
      }}
>
  <Sidebar.Header>
    <!-- Під час підглядання шапка порожня: кнопка перемикання лишається
         рівно там, де стояла до наїзду панелі (вона плаває поверх, а не
         всередині), і не стрибає з місця на місце. Лого з назвою —
         нагорода за справжнє відкриття, тобто за клік. -->
    <div class="flex h-9 items-center justify-between gap-2">
      {#if hidden && peekChrome}
        <span class="sr-only">Меню</span>
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
              <!-- Без tooltipContent: підпис пункту й так написаний
                   поруч, а тултип, який повторює видимий текст, — шум.
                   Він був потрібен лише згорнутій панелі з самими
                   іконками, а такого стану більше немає. -->
              <Sidebar.MenuButton isActive={active}>
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={item.href}
                    onclick={closeOnMobile}
                    aria-current={active ? 'page' : undefined}
                    aria-label={count > 0
                      ? `${item.label} — ${count}`
                      : item.label}
                  >
                    <span class="nav-icon relative flex shrink-0">
                      <item.icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
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
    <Sidebar.Menu class="gap-0">
      <Sidebar.MenuItem>
        <Sidebar.MenuButton isActive={settingsActive || settingsDialog.open}>
          {#snippet child({ props })}
            <!-- Лишається посиланням, а не кнопкою: середній клік і
                 «відкрити в новій вкладці» ведуть на справжній маршрут,
                 звичайний клік відкриває модалку поверх сторінки. -->
            <a
              {...props}
              href="/dashboard/settings"
              aria-current={settingsActive ? 'page' : undefined}
              onclick={openSettings}
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

  /* Підглядання: панель наїжджає ПОВЕРХ сторінки. Рухається лише вона —
     розпірка лишається нульовою, тож контент не совається під побіжний
     погляд у меню. Геометрію не чіпаємо навмисно: будь-яка зміна висоти
     чи заокруглення застосувалась би миттєво (вони не в transition), і
     панель смикалась би на вході й виході. Тінь — єдине, що відрізняє
     «поверх» від «на своєму місці», і вона гасне плавно. */
  :global([data-slot='sidebar-container'].peek) {
    inset-inline-start: 0 !important;
    z-index: 40;
  }

  /* Межа праворуч — тонка чорна лінія. Колір заданий прямо, а не
     через --border: фон панелі дорівнює фону дашборда, і токен межі,
     розрахований на межу між РІЗНИМИ площинами, тут просто зникав.

     !important — бо ширину межі ставить утиліта блока sidebar-07
     (`group-data-[side=left]:border-e`), і без нього виграє вона. */
  :global([data-slot='sidebar-container']) {
    border-inline-end: 1px solid rgb(0 0 0 / 0.16) !important;
    box-shadow: none;
    transition-property: left, right, width, box-shadow;
  }
  :global([data-slot='sidebar-container'].peek) {
    box-shadow: 0 18px 48px -12px rgb(0 0 0 / 0.3);
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

  /* Кнопка відкриття поверх контенту: без фону, доки на неї не навели —
     інакше вона читалась би як елемент самої сторінки.

     Перемикається через visibility, а НЕ через прозорість. Прозорість
     тут давала саме те смикання, що видно оком: кнопка починала
     проявлятись, поки повз неї ще їхала панель зі своєю кнопкою, і дві
     іконки перетинались. Затримка дорівнює проїзду: спершу панель
     повністю йде за край, і аж тоді зʼявляється кнопка. Зникає вона
     навпаки — миттєво, бо панель уже виїжджає їй на зміну. */
  .open-panel {
    visibility: hidden;
    background-color: transparent;
    transition:
      visibility 0s linear 0s,
      background-color 150ms ease;
  }
  .open-panel.is-visible {
    visibility: visible;
    transition:
      visibility 0s linear 260ms,
      background-color 150ms ease;
  }
  .open-panel.is-visible:hover,
  .open-panel:focus-visible {
    background-color: var(--accent);
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
