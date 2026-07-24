<!-- src/routes/(auth)/dashboard/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import Sidebar from '$lib/components/dashboard/sidebar.svelte'

  let { children } = $props()

  // Повноекранні чат-сторінки (без скролу сторінки): AI-оформлення заявки
  // (точний збіг — /manual це звичайна форма зі скролом!) та месенджер.
  let isChat = $derived(
    page.url.pathname === '/dashboard/jobs/new' ||
      page.url.pathname.startsWith('/dashboard/messages'),
  )

  // ─── Друга лінія оборони (перша — hooks.server.ts) ───
  // SPA-навігація "назад" на роут БЕЗ серверного load не торкається сервера,
  // тож серверний guard її не бачить. Якщо в page.data сесії немає —
  // клієнт сам виводить на логін. replaceState: не засмічуємо історію.
  $effect(() => {
    if (!page.data.session) {
      goto('/user/login', { replaceState: true })
    }
  })

  // ─── bfcache ───
  // event.persisted означає відновлення сторінки зі снімка в памʼяті:
  // кнопка «назад», АЛЕ ТАКОЖ повернення з системного вибору файлу на
  // мобільних. Сліпий reload тут знищував би стан SPA (діалог із Zunor
  // при додаванні фото). Тому: легка перевірка сесії, і перезавантаження
  // ЛИШЕ якщо її немає — сценарій «logout → назад» досі вибиває на логін,
  // а повернення з фото-пікера не чіпає нічого.
  async function onPageShow(event: PageTransitionEvent) {
    if (!event.persisted) return
    try {
      const res = await fetch('/api/auth/get-session', {
        headers: { accept: 'application/json' },
      })
      const session = res.ok ? await res.json().catch(() => null) : null
      const empty =
        !session ||
        (typeof session === 'object' && Object.keys(session).length === 0)
      if (empty) window.location.reload()
    } catch {
      // мережа впала — нічого не робимо: серверний guard відпрацює
      // на першому ж реальному запиті
    }
  }
</script>

<svelte:window onpageshow={onPageShow} />

<div
  class="flex bg-(--dashboard) pt-2 pr-2 pb-2"
  class:h-screen={isChat}
  class:min-h-screen={!isChat}
>
  <Sidebar />

  <div
    class="flex min-w-0 flex-1 flex-col rounded-xl bg-background"
    class:min-h-0={isChat}
    class:overflow-hidden={isChat}
  >
    <main class="flex-1" class:min-h-0={isChat} class:overflow-hidden={isChat}>
      {@render children()}
    </main>
  </div>
</div>
