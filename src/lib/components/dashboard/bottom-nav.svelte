<!-- src/lib/components/dashboard/bottom-nav.svelte -->
<!--
  Нижняя навигация /dashboard на мобильном — замена sidebar.svelte
  когда экран узкий (md:hidden). Показывает 5 ключевых пунктов;
  "Аналітика" в нижнее меню не выносим (мало места) — она доступна
  из сайдбара на десктопе и из /dashboard на мобильном.
-->
<script lang="ts">
  import { page } from '$app/state'
  import {
    LayoutDashboard,
    Briefcase,
    ClipboardList,
    MessageCircle,
    Bell,
  } from 'lucide-svelte'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { notifications } from '$lib/notifications/store.svelte'

  // Лічильники — з тих самих сторів, що й у сайдбарі. Дані живуть у
  // браузері й оновлюються через Pusher, тому серверні бейджі в page.data
  // більше не потрібні (і не коштують запиту до БД на кожну навігацію).
  const badges = $derived({
    notifications: notifications.unreadCount,
    messages: chatStore.totalUnread,
  })

  const items = [
    {
      href: '/dashboard',
      label: 'Профіль',
      icon: LayoutDashboard,
      exact: true,
    },
    { href: '/dashboard/jobs', label: 'Заявки', icon: Briefcase },
    { href: '/dashboard/orders', label: 'Замовлення', icon: ClipboardList },
    {
      href: '/dashboard/messages',
      label: 'Чат',
      icon: MessageCircle,
      badgeKey: 'messages' as const,
    },
    {
      href: '/dashboard/notifications',
      label: 'Сповіщення',
      icon: Bell,
      badgeKey: 'notifications' as const,
    },
  ]

  function isActive(item: (typeof items)[0]): boolean {
    return item.exact
      ? page.url.pathname === item.href
      : page.url.pathname.startsWith(item.href)
  }

  function badgeFor(item: (typeof items)[0]): number {
    if (!item.badgeKey) return 0
    return badges[item.badgeKey] ?? 0
  }
</script>

<nav
  class="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center"
  style="background-color: var(--card);
         border-top: 1px solid var(--border);
         padding-bottom: env(safe-area-inset-bottom, 0px);"
>
  {#each items as item}
    {@const active = isActive(item)}
    {@const badge = badgeFor(item)}
    <a
      href={item.href}
      class="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 relative transition-opacity"
      style="opacity: {active ? 1 : 0.55}"
    >
      <span class="relative">
        <item.icon
          class="size-[21px]"
          strokeWidth={1.75}
          style="color: var(--foreground)"
        />
        {#if badge > 0}
          <span
            class="absolute -top-1.5 -right-2 min-w-[16px] h-4 text-[9px] font-bold rounded-full flex items-center justify-center px-1 pointer-events-none"
            style="background-color: var(--primary); color: var(--primary-foreground)"
          >
            {badge > 99 ? '99+' : badge}
          </span>
        {/if}
      </span>
      <span
        class="text-[10px] font-medium leading-none"
        style="color: var(--foreground)"
      >
        {item.label}
      </span>
      {#if active}
        <span
          class="absolute bottom-1 size-1 rounded-full"
          style="background-color: var(--primary)"
        ></span>
      {/if}
    </a>
  {/each}
</nav>

<!-- Spacer, чтобы контент не прятался под fixed-меню -->
<div
  class="md:hidden"
  style="height: calc(60px + env(safe-area-inset-bottom, 0px))"
></div>
