<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { goto } from '$app/navigation'
  import { Menu, X } from 'lucide-svelte'
  import UserMenu from './user-menu.svelte'
  import Logo from './logo.svelte'
  import MobileNav from './mobile-nav.svelte'

  let visible = $state(true)
  let mobileOpen = $state(false)
  let lastScrollY = 0
  let scrollTimer: ReturnType<typeof setTimeout> | null = null

  function navigate(url: string) {
    mobileOpen = false
    goto(url)
  }

  onMount(() => {
    lastScrollY = window.scrollY

    function handleScroll() {
      if (scrollTimer) return
      scrollTimer = setTimeout(() => {
        scrollTimer = null
        const currentY = window.scrollY
        if (currentY < 10) visible = true
        else if (currentY > lastScrollY + 8) visible = false
        else if (currentY < lastScrollY - 8) visible = true
        lastScrollY = currentY
      }, 50)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimer) clearTimeout(scrollTimer)
    }
  })
</script>

<div
  class="fixed top-0 left-0 right-0 z-50 transition-transform duration-300 will-change-transform"
  class:-translate-y-full={!visible}
>
  <header class="h-14 bg-black border-b border-white/5 flex items-center px-6">
    <div
      class="max-w-6xl mx-auto w-full flex items-center justify-between gap-6"
    >
      <!-- Лево -->
      <div class="flex items-center gap-8">
        <Logo />
        <nav class="hidden md:flex items-center gap-0.5">
          <a href="/services" class="nav-link">Послуги</a>
          <a href="/how-it-works" class="nav-link">Як це працює</a>
          <a href="/business" class="nav-link">Бізнес</a>
          <a href="/about" class="nav-link">Про нас</a>
        </nav>
      </div>

      <!-- Право десктоп -->
      <div class="hidden md:flex items-center gap-2">
        <UserMenu onnavigate={navigate} />
      </div>

      <!-- Право мобайл -->
      <div class="md:hidden flex items-center gap-1">
        <button
          onclick={() => navigate('/user/login')}
          class="h-8 px-3 rounded-full text-[13px] text-white/80 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
        >
          Увійти
        </button>
        <button
          onclick={() => navigate('/user/register')}
          class="h-8 px-3 rounded-full text-[13px] font-medium bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
        >
          Реєстрація
        </button>
        <button
          class="flex items-center justify-center h-9 w-9 rounded-full text-white/80 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
          onclick={() => (mobileOpen = !mobileOpen)}
          aria-label="Меню"
        >
          {#if mobileOpen}
            <X class="size-5" />
          {:else}
            <Menu class="size-5" />
          {/if}
        </button>
      </div>
    </div>
  </header>

  <!-- Мобильное меню -->
  {#if mobileOpen}
    <div
      transition:fade={{ duration: 150 }}
      class="md:hidden bg-black border-b border-white/5 px-6 pb-4"
    >
      <nav class="flex flex-col gap-1 pt-2">
        <a
          href="/services"
          onclick={() => (mobileOpen = false)}
          class="mob-link">Послуги</a
        >
        <a
          href="/how-it-works"
          onclick={() => (mobileOpen = false)}
          class="mob-link">Як це працює</a
        >
        <a
          href="/business"
          onclick={() => (mobileOpen = false)}
          class="mob-link">Бізнес</a
        >
        <a href="/about" onclick={() => (mobileOpen = false)} class="mob-link"
          >Про нас</a
        >
      </nav>
    </div>
  {/if}
</div>

<!-- Оверлей -->
{#if mobileOpen}
  <button
    transition:fade={{ duration: 150 }}
    class="fixed inset-0 z-40 cursor-default w-full border-none p-0 md:hidden"
    style="background-color: rgba(0,0,0,0.5)"
    onclick={() => (mobileOpen = false)}
    aria-label="Закрити"
  ></button>
{/if}

<MobileNav onnavigate={navigate} hasNotifications={true} />

<div class="h-14"></div>

<style>
  .nav-link {
    padding: 4px 12px;
    font-size: 13px;
    font-weight: 400;
    color: rgb(255, 255, 255);
    border-radius: 6px;
    transition:
      color 0.15s,
      background 0.15s;
    text-decoration: none;
    white-space: nowrap;
  }
  .nav-link:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.07);
  }
  .mob-link {
    padding: 10px 12px;
    font-size: 15px;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.8);
    border-radius: 8px;
    transition:
      color 0.15s,
      background 0.15s;
    text-decoration: none;
  }
  .mob-link:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.07);
  }
</style>
