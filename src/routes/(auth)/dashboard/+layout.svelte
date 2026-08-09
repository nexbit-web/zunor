<script lang="ts">
  import { untrack } from 'svelte'
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import AppSidebar from '$lib/components/dashboard/app-sidebar.svelte'
  import MobileTrigger from '$lib/components/dashboard/mobile-trigger.svelte'

  let { data, children } = $props()

  // untrack: cookie дає лише ПОЧАТКОВИЙ стан. Далі його веде сам
  // Sidebar.Provider через bind, і перезапис із data згортав би панель
  // на кожній навігації.
  let sidebarOpen = $state(untrack(() => data.sidebarOpen))

  // Чат і майстер заявки — повноекранні: там скролить внутрішня область,
  // а не сторінка, інакше композер їде за межі вікна.
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

<Sidebar.Provider bind:open={sidebarOpen}>
  <AppSidebar />

  <Sidebar.Inset
    class="min-w-0 bg-background"
    style="background-color: var(--background)"
  >
    <!-- Кнопка панелі лише для мобільного: на десктопі згортання живе в
         самій панелі, на місці логотипа. Окремої шапки на дашборді немає
         навмисно — вона забирала б рядок контенту на кожному екрані
         заради однієї кнопки.

         Окремого нижнього меню теж більше немає: Sidebar сам відповідає
         за мобільний режим, а два різні меню рано чи пізно розійшлись би
         складом пунктів. -->
    <MobileTrigger />

    <main
      class="flex flex-1"
      class:min-h-0={isChat}
      class:overflow-hidden={isChat}
    >
      <div class="min-w-0 flex-1" class:overflow-hidden={isChat}>
        {@render children()}
      </div>
    </main>
  </Sidebar.Inset>
</Sidebar.Provider>
