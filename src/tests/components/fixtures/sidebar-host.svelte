<script lang="ts">
  // Обгортка для тестів панелі.
  //
  // AppSidebar читає контекст Sidebar.Provider (стан «розгорнуто», isMobile,
  // toggle) і всередині користується Tooltip, чий Provider теж дає
  // Sidebar.Provider. Підсунути це контекстом ззовні не можна: setContext
  // працює лише під час ініціалізації компонента, тож потрібен справжній
  // батько — ось він.

  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import AppSidebar from '$lib/components/dashboard/app-sidebar.svelte'

  let { open = true }: { open?: boolean } = $props()
</script>

<Sidebar.Provider {open}>
  <AppSidebar />
</Sidebar.Provider>
