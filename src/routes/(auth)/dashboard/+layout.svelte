<!-- src/routes/(auth)/dashboard/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/stores'
  import Sidebar from '$lib/components/dashboard/sidebar.svelte'

  let { children } = $props()

  let isChat = $derived(
    $page.url.pathname.startsWith('/dashboard/jobs/new/ai') ||
      $page.url.pathname.startsWith('/dashboard/messages'),
  )
</script>

<div
  class="flex bg-(--dashboard) pt-2 pr-2 pb-2"
  class:h-screen={isChat}
  class:min-h-screen={!isChat}
>
  <Sidebar />

  <div
    class="flex min-w-0 flex-1 flex-col rounded-2xl bg-background"
    class:min-h-0={isChat}
    class:overflow-hidden={isChat}
  >
    <main class="flex-1" class:min-h-0={isChat} class:overflow-hidden={isChat}>
      {@render children()}
    </main>
  </div>
</div>
