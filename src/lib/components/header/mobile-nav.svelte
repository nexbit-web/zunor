<!-- src/lib/components/header/mobile-nav.svelte -->
<script lang="ts">
  import { Home, LayoutGrid, Bell, User, MessageCircle } from 'lucide-svelte'
  import { page } from '$app/stores'

  let {
    onnavigate,
    hasNotifications = false,
  }: {
    onnavigate: (url: string) => void
    hasNotifications: boolean
  } = $props()

  const items = [
    {
      id: 'home',
      icon: Home,
      label: 'Головна',
      href: '/',
      action: () => onnavigate('/'),
    },
    {
      id: 'catalog',
      icon: LayoutGrid,
      label: 'Каталог',
      href: '/services',
      action: () => onnavigate('/services'),
    },
    {
      id: 'messages',
      icon: MessageCircle,
      label: 'Чат',
      href: '/messages',
      action: () => onnavigate('/messages'),
      badge: 3,
    },
    {
      id: 'notifications',
      icon: Bell,
      label: 'Сповіщення',
      href: '/notifications',
      action: () => onnavigate('/notifications'),
      badge: hasNotifications ? 5 : 0,
    },
    {
      id: 'profile',
      icon: User,
      label: 'Профіль',
      href: '/dashboard',
      action: () => onnavigate('/dashboard'),
    },
  ]

  function isActive(item: (typeof items)[0]): boolean {
    if (item.id === 'catalog') return false
    if (item.href === '/') return $page.url.pathname === '/'
    return item.href ? $page.url.pathname.startsWith(item.href) : false
  }
</script>

<nav
  class="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center"
  style="background-color: #000;
         border-top: 1px solid rgba(255,255,255,0.08);
         padding-bottom: env(safe-area-inset-bottom, 0px);"
>
  {#each items as item}
    {@const active = isActive(item)}
    <button
      type="button"
      onclick={item.action}
      class="flex-1 flex flex-col items-center justify-center gap-1 py-3 cursor-pointer relative transition-opacity"
      class:opacity-100={active}
      style="opacity: {active ? 1 : 0.6}"
    >
      <div class="relative">
        <item.icon
          class="size-[22px]"
          strokeWidth={1.75}
          color="white"
        />
        {#if item.badge && item.badge > 0}
          <span
            class="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] text-[10px] font-bold rounded-full flex items-center justify-center px-1 pointer-events-none"
            style="background-color: black; color: white; border: 1.5px solid white;"
          >
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        {/if}
      </div>

      <span
        class="text-[10px] font-medium leading-none"
        style="color: white"
      >
        {item.label}
      </span>

      {#if active}
        <span
          class="absolute bottom-1.5 size-1 rounded-full"
          style="background-color: white"
        ></span>
      {/if}
    </button>
  {/each}
</nav>

<!-- Spacer щоб контент не ховався за fixed-меню (бот 68px + safe-area) -->
 