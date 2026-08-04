<!-- src/routes/(auth)/dashboard/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import Sidebar from '$lib/components/dashboard/sidebar.svelte'
  let { data, children } = $props()

  let sidebarCollapsed = $state(data.sidebarCollapsed)

  let isChat = $derived(
    page.url.pathname === '/dashboard/jobs/new' ||
      page.url.pathname.startsWith('/dashboard/messages'),
  )

  // null означає «сервер сказав, що сесії немає».
  // undefined — «дані ще не приїхали»: редиректити рано.
  $effect(() => {
    if (page.data.session === null) {
      goto('/user/login', { replaceState: true })
    }
  })

  async function onPageShow(event: PageTransitionEvent): Promise<void> {
    if (!event.persisted) return

    const url = '/api/auth/get-session?disableCookieCache=true'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },

        cache: 'no-store',
        signal: controller.signal,
      })

      if (!res.ok) {
        window.location.reload()
        return
      }

      const body: unknown = await res.json().catch(() => null)

      const hasSession =
        !!body &&
        typeof body === 'object' &&
        'user' in body &&
        !!(body as { user: unknown }).user

      if (!hasSession) window.location.reload()
    } catch {
      // Обрив або таймаут: нічого не робимо. Серверний guard у hooks
      // відпрацює на першому ж навігаційному запиті — краще лишити
      // сторінку, ніж перезавантажувати наосліп при поганій мережі.
    } finally {
      clearTimeout(timeout)
    }
  }
</script>

<svelte:window onpageshow={onPageShow} />

<div
  class="flex bg-(--dashboard)"
  class:h-screen={isChat}
  class:min-h-screen={!isChat}
>
  <Sidebar bind:collapsed={sidebarCollapsed} />

  <div
    class="flex min-w-0 flex-1 flex-col bg-background"
    class:min-h-0={isChat}
    class:overflow-hidden={isChat}
  >
    <main class="flex-1" class:min-h-0={isChat} class:overflow-hidden={isChat}>
      {@render children()}
    </main>
  </div>
</div>
