<script lang="ts">
  // Рядок користувача в підвалі панелі: аватар, імʼя і стрілка — як у
  // референсі (docs/). Веде в профіль.
  //
  // Це посилання, а не меню. Випадне меню прибрано: усе, що в ньому
  // було, і так є на своїх місцях — профіль тут, вихід унизу меню
  // налаштувань. Меню, яке дублює навігацію, змушує здогадуватись, де
  // саме шукати дію.

  import { page } from '$app/state'
  import ChevronRightIcon from '$lib/components/icons/set/chevron-right.svelte'
  import * as Avatar from '$lib/components/ui/avatar/index.js'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import { useSidebar } from '$lib/components/ui/sidebar/index.js'

  const session = $derived(page.data.session)

  const user = $derived({
    name: session?.user?.name ?? 'Користувач',
    avatar: session?.user?.image ?? '',
    initials: (session?.user?.name ?? 'U')[0].toUpperCase(),
  })

  const active = $derived(page.url.pathname.startsWith('/dashboard/profile'))

  const sidebar = useSidebar()

  // Як і решта пунктів: на телефоні перехід закриває шторку, інакше вона
  // лишилась би поверх щойно відкритої сторінки.
  function closeOnMobile(): void {
    if (sidebar.isMobile) sidebar.setOpenMobile(false)
  }
</script>

<Sidebar.Menu>
  <Sidebar.MenuItem>
    <!-- Тултип лише в рейці, де від рядка лишається сам аватар; у
         розгорнутій панелі імʼя написане поруч. У рейці — аватар по
         центру квадрата 40px. -->
    <Sidebar.MenuButton
      class="h-11 gap-3 rounded-lg px-2 text-[15px] group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center"
      isActive={active}
      tooltipContent={user.name}
      tooltipContentProps={{ sideOffset: 8, arrowClasses: 'hidden' }}
    >
      {#snippet child({ props })}
        <a
          {...props}
          href="/dashboard/profile"
          onclick={closeOnMobile}
          aria-current={active ? 'page' : undefined}
        >
          <Avatar.Root class="size-7 shrink-0 rounded-full">
            <Avatar.Image src={user.avatar} alt="" />
            <Avatar.Fallback
              class="rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            >
              {user.initials}
            </Avatar.Fallback>
          </Avatar.Root>
          <span
            class="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden"
          >
            {user.name}
          </span>
          <ChevronRightIcon
            strokeWidth={1.75}
            class="text-muted-foreground group-data-[collapsible=icon]:hidden"
          />
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>
</Sidebar.Menu>
