<!-- src/lib/components/header/mobile-nav.svelte -->
<script lang="ts">
  import Home from '@lucide/svelte/icons/home'
  import LayoutGrid from '@lucide/svelte/icons/layout-grid'
  import Bell from '@lucide/svelte/icons/bell'
  import User from '@lucide/svelte/icons/user'
  import MessageCircle from '@lucide/svelte/icons/message-circle'
  // $app/state, а не застарілий $app/stores: у SvelteKit 2 стори-обгортки
  // лишились лише для сумісності, читаємо page напряму без $-префікса.
  import { page } from '$app/state'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { notifications } from '$lib/notifications'

  let { onnavigate }: { onnavigate: (url: string) => void } = $props()

  // Саме $derived, а не const: масив читає лічильники зі сторів, і як
  // звичайна константа він обчислився б один раз при монтуванні — бейджі
  // назавжди застигли б на значеннях моменту відкриття сторінки.
  //
  // Раніше тут стояли захардкоджені 3 і 5: мобільна навігація показувала
  // вигадані числа замість справжніх непрочитаних.
  const items = $derived([
    {
      id: 'home',
      icon: Home,
      label: 'Головна',
      href: '/',
      action: () => onnavigate('/'),
      badge: 0,
    },
    {
      id: 'catalog',
      icon: LayoutGrid,
      label: 'Каталог',
      href: '/services',
      action: () => onnavigate('/services'),
      badge: 0,
    },
    {
      id: 'messages',
      icon: MessageCircle,
      label: 'Чат',
      href: '/messages',
      action: () => onnavigate('/messages'),
      badge: chatStore.totalUnread,
    },
    {
      id: 'notifications',
      icon: Bell,
      label: 'Сповіщення',
      href: '/notifications',
      action: () => onnavigate('/notifications'),
      badge: notifications.unreadCount,
    },
    {
      id: 'profile',
      icon: User,
      label: 'Профіль',
      href: '/dashboard',
      action: () => onnavigate('/dashboard'),
      badge: 0,
    },
  ])

  function isActive(item: (typeof items)[0]): boolean {
    if (item.id === 'catalog') return false
    if (item.href === '/') return page.url.pathname === '/'
    return item.href ? page.url.pathname.startsWith(item.href) : false
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
        <item.icon class="size-[22px]" strokeWidth={1.75} color="white" />
        {#if item.badge && item.badge > 0}
          <span
            class="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] text-[10px] font-bold rounded-full flex items-center justify-center px-1 pointer-events-none"
            style="background-color: black; color: white; border: 1.5px solid white;"
          >
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        {/if}
      </div>

      <span class="text-[10px] font-medium leading-none" style="color: white">
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
