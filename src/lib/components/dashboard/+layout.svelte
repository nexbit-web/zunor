<!--
  Shell всей защищённой зоны приложения (бывшая src/routes/(auth)).
  Больше НЕ рендерит глобальный Header/Footer — они скрыты для всех
  /dashboard/* маршрутов в src/routes/+layout.svelte.

  Desktop (md+): фиксированный левый сайдбар + скроллируемая контентная область.
  Mobile (<md): сайдбар скрыт, вместо него внизу — bottom-nav.
-->
<script lang="ts">
  import { page } from '$app/state'
  import Sidebar from '$lib/components/dashboard/sidebar.svelte'
  import BottomNav from '$lib/components/dashboard/bottom-nav.svelte'

  let { children } = $props()

  let collapsed = $state(false)

  // Чат — свой полноэкранный UI на мобильном (как мессенджер),
  // нижняя навигация там мешает, как раньше глобальный хедер там прятался.
  const hideBottomNav = $derived(
    page.url.pathname.startsWith('/dashboard/messages'),
  )
</script>

<div
  class="flex h-screen w-full overflow-hidden"
  style="background-color: var(--background)"
>
  <Sidebar bind:collapsed />

  <div class="flex-1 min-w-0 h-screen overflow-y-auto">
    <main class="h-full">
      {@render children()}
    </main>
    {#if !hideBottomNav}
      <BottomNav />
    {/if}
  </div>
</div>
