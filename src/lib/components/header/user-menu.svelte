<!-- src/lib/components/header/user-menu.svelte
     Тільки акаунт: аватар, меню профілю, вихід. Для гостя — кнопки входу.

     Сповіщення й чати звідси прибрані: вони живуть у сайдбарі дашборда,
     а стан тримає $lib/notifications. Хедер сховано на всьому /dashboard
     (hiddenLayoutRoutes), тож тримати тут другу копію тих самих лічильників
     не було сенсу — вони ще й розходились між собою. -->
<script lang="ts">
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from '$lib/components/ui/avatar'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { Button } from '$lib/components/ui/button'
  import {
    LayoutDashboard,
    CircleUserRound,
    Settings,
    LogOut,
  } from 'lucide-svelte'
  import { signOut } from '$lib/auth-client'
  import { goto, invalidateAll } from '$app/navigation'
  import { page } from '$app/state'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { disconnectPusher } from '$lib/pusher-client'
  import toast from 'svelte-hot-french-toast'

  let { onnavigate }: { onnavigate: (url: string) => void } = $props()

  const session = $derived(page.data.session)
  const isLoggedIn = $derived(!!session?.user)

  const user = $derived(
    session?.user
      ? {
          name: session.user.name ?? 'Користувач',
          email: session.user.email ?? '',
          avatar: session.user.image ?? '',
          initials: (session.user.name ?? 'U')[0].toUpperCase(),
        }
      : null,
  )

  let signingOut = $state(false)

  async function handleSignOut(): Promise<void> {
    if (signingOut) return
    signingOut = true

    try {
      // Спершу рвемо реалтайм: інакше лишиться відкритий сокет
      // на канал користувача, якого вже немає в сесії.
      chatStore.unsubscribeAll()
      disconnectPusher()

      await signOut()
      await invalidateAll()
      await goto('/')
      toast('До зустрічі!', { icon: '👋' })
    } catch {
      signingOut = false
      toast.error('Не вдалося вийти. Спробуйте ще раз.')
    }
    // При успіху не скидаємо: сторінка вже пішла на головну.
  }
</script>

{#if isLoggedIn && user}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      class="rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label="Меню акаунта"
    >
      <Avatar class="size-9">
        {#if user.avatar}
          <AvatarImage src={user.avatar} alt="" class="object-cover" />
        {/if}
        <AvatarFallback
          class="bg-muted text-sm font-medium text-muted-foreground"
        >
          {user.initials}
        </AvatarFallback>
      </Avatar>
    </DropdownMenu.Trigger>

    <DropdownMenu.Content class="w-60" align="end" sideOffset={8}>
      <!-- Шапка меню: ім'я та пошта. Пошта truncate — довгі адреси
           інакше розтягують випадайку. -->
      <div class="px-2 py-1.5">
        <p class="truncate text-sm font-medium">{user.name}</p>
        {#if user.email}
          <p class="truncate text-xs text-muted-foreground">{user.email}</p>
        {/if}
      </div>

      <DropdownMenu.Separator />

      <DropdownMenu.Item onSelect={() => onnavigate('/dashboard')}>
        <LayoutDashboard class="size-4" aria-hidden="true" />
        Кабінет
      </DropdownMenu.Item>

      <DropdownMenu.Item
        onSelect={() => onnavigate('/dashboard/settings/profile')}
      >
        <CircleUserRound class="size-4" aria-hidden="true" />
        Профіль
      </DropdownMenu.Item>

      <DropdownMenu.Item
        onSelect={() => onnavigate('/dashboard/settings/appearance')}
      >
        <Settings class="size-4" aria-hidden="true" />
        Налаштування
      </DropdownMenu.Item>

      <DropdownMenu.Separator />

      <DropdownMenu.Item
        onSelect={handleSignOut}
        disabled={signingOut}
        class="text-destructive data-[highlighted]:text-destructive"
      >
        <LogOut class="size-4" aria-hidden="true" />
        {signingOut ? 'Виходимо...' : 'Вийти'}
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{:else}
  <!-- Гість: два входи. На десктопі це єдина точка входу в акаунт —
       у мобільному меню є свої кнопки. -->
  <div class="flex items-center gap-2">
    <Button variant="ghost" size="sm" onclick={() => onnavigate('/user/login')}>
      Увійти
    </Button>
    <Button size="sm" onclick={() => onnavigate('/user/register')}>
      Реєстрація
    </Button>
  </div>
{/if}
