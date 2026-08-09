<script lang="ts">
  // Рядок користувача в підвалі панелі: аватар та імʼя.
  //
  // Це посилання, а не меню. Вигляд лишився від блоку sidebar-07 (той
  // самий великий рядок з аватаром), але випадне меню прибрано: усе, що
  // в ньому було, і так є на своїх сторінках — профіль тут, вихід у
  // /dashboard/settings/account. Меню, яке дублює навігацію, змушує
  // здогадуватись, де саме шукати дію.

  import { page } from '$app/state'
  import * as Avatar from '$lib/components/ui/avatar/index.js'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'

  const session = $derived(page.data.session)

  const user = $derived({
    name: session?.user?.name ?? 'Користувач',
    email: session?.user?.email ?? '',
    avatar: session?.user?.image ?? '',
    initials: (session?.user?.name ?? 'U')[0].toUpperCase(),
  })

  const active = $derived(page.url.pathname.startsWith('/dashboard/profile'))
</script>

<Sidebar.Menu>
  <Sidebar.MenuItem>
    <Sidebar.MenuButton size="lg" isActive={active} tooltipContent={user.name}>
      {#snippet child({ props })}
        <a
          {...props}
          href="/dashboard/profile"
          aria-current={active ? 'page' : undefined}
        >
          <Avatar.Root class="size-8 rounded-lg">
            <Avatar.Image src={user.avatar} alt="" />
            <Avatar.Fallback
              class="rounded-lg bg-muted text-xs font-semibold text-foreground"
            >
              {user.initials}
            </Avatar.Fallback>
          </Avatar.Root>
          <div class="grid flex-1 text-start text-sm leading-tight">
            <span class="truncate font-medium">{user.name}</span>
            {#if user.email}
              <span class="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            {/if}
          </div>
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>
</Sidebar.Menu>
