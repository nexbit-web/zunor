<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { Menu, X } from 'lucide-svelte'
  import UserMenu from './user-menu.svelte'
  import Logo from './logo.svelte'
  import MobileNav from './mobile-nav.svelte'

  const NAV_LINKS = [
    { href: '/how-it-works', label: 'Як це працює' },
    { href: '/about', label: 'Про нас' },
  ]

  let mobileOpen = $state(false)

  // ─── Прозорий хедер вгорі сторінки, фон з'являється при скролі ───
  // Поріг у пікселях — після якого хедер вважається "прижатим" і
  // отримує фон/блюр/тінь. Трохи більше за 0, щоб не мигало на
  // мікроскопічних侵 колейбаунсах скролу (напр. на iOS).
  const SCROLL_THRESHOLD = 8
  let scrolled = $state(false)

  function handleScroll() {
    scrolled = window.scrollY > SCROLL_THRESHOLD
  }

  onMount(() => {
    handleScroll() // врахувати стан одразу (напр. якщо сторінка відкрита не з самого верху)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  })

  // Головна відрізняється: точна відповідність "/", решта — startsWith
  function isActive(href: string): boolean {
    return href === '/'
      ? page.url.pathname === '/'
      : page.url.pathname.startsWith(href)
  }

  function navigate(url: string) {
    mobileOpen = false
    goto(url)
  }
</script>

<div class="sticky top-0 z-50">
  <header
    class="h-14 transition-[background-color,backdrop-filter,box-shadow] duration-300 ease-out"
    class:header-scrolled={scrolled}
  >
    <div
      class="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-6 px-6"
    >
      <!-- Лево -->
      <div class="flex items-center gap-8">
        <Logo />
        <nav
          class="hidden items-center gap-0.5 md:flex"
          aria-label="Основна навігація"
        >
          {#each NAV_LINKS as link (link.href)}
            <a
              href={link.href}
              class="nav-link"
              class:is-active={isActive(link.href)}
              aria-current={isActive(link.href) ? 'page' : undefined}
            >
              {link.label}
            </a>
          {/each}
        </nav>
      </div>

      <!-- Право десктоп -->
      <div class="hidden items-center gap-2 md:flex">
        <UserMenu onnavigate={navigate} />
      </div>

      <!-- Право мобайл -->
      <div class="flex items-center gap-1 md:hidden">
        <button
          onclick={() => navigate('/user/login')}
          class="h-8 cursor-pointer rounded-full px-3 text-[13px] text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Увійти
        </button>
        <button
          onclick={() => navigate('/user/register')}
          class="h-8 cursor-pointer rounded-full bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Реєстрація
        </button>
        <button
          class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onclick={() => (mobileOpen = !mobileOpen)}
          aria-label={mobileOpen ? 'Закрити меню' : 'Відкрити меню'}
          aria-expanded={mobileOpen}
        >
          {#if mobileOpen}
            <X class="size-5" aria-hidden="true" />
          {:else}
            <Menu class="size-5" aria-hidden="true" />
          {/if}
        </button>
      </div>
    </div>
  </header>

  <!-- Мобільне меню -->
  {#if mobileOpen}
    <div
      transition:fade={{ duration: 150 }}
      class="border-b border-border bg-background px-6 pb-4 md:hidden"
    >
      <nav class="flex flex-col gap-1 pt-2" aria-label="Мобільна навігація">
        {#each NAV_LINKS as link (link.href)}
          <a
            href={link.href}
            onclick={() => (mobileOpen = false)}
            class="mob-link"
            class:is-active={isActive(link.href)}
            aria-current={isActive(link.href) ? 'page' : undefined}
          >
            {link.label}
          </a>
        {/each}
      </nav>
    </div>
  {/if}
</div>

<!-- Оверлей -->
{#if mobileOpen}
  <button
    transition:fade={{ duration: 150 }}
    class="fixed inset-0 z-40 w-full cursor-default border-none p-0 md:hidden"
    style="background-color: color-mix(in oklch, var(--foreground) 45%, transparent)"
    onclick={() => (mobileOpen = false)}
    aria-label="Закрити меню"
  ></button>
{/if}

<MobileNav onnavigate={navigate} hasNotifications={true} />

<style>
  /* За замовчуванням хедер повністю прозорий — фон hero-секції видно
     наскрізь. Клас .header-scrolled додається лише після того, як
     сторінку проскролили за SCROLL_THRESHOLD. */
  .header-scrolled {
    background-color: color-mix(in oklch, var(--background) 85%, transparent);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .nav-link {
    padding: 4px 12px;
    font-size: 15px;
    font-weight: 500;
    color: var(--foreground);
    border-radius: 6px;
    position: relative;
    transition:
      color 0.15s,
      background 0.15s;
    text-decoration: none;
    white-space: nowrap;
  }
  .nav-link:hover {
    color: var(--primary);
    background: var(--muted);
  }
  .nav-link:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .nav-link.is-active {
    color: var(--primary);
    font-weight: 600;
  }
  .nav-link.is-active::after {
    content: '';
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: -1px;
    height: 2px;
    background: var(--primary);
    border-radius: 1px;
  }

  .mob-link {
    padding: 10px 12px;
    font-size: 15px;
    font-weight: 500;
    color: var(--foreground);
    border-radius: 8px;
    transition:
      color 0.15s,
      background 0.15s;
    text-decoration: none;
  }
  .mob-link:hover {
    color: var(--primary);
    background: var(--muted);
  }
  .mob-link:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .mob-link.is-active {
    color: var(--primary);
    font-weight: 700;
    background: color-mix(in oklch, var(--primary) 8%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-link,
    .mob-link,
    header {
      transition: none;
    }
  }
</style>
