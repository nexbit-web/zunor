<script lang="ts">
  import { untrack } from 'svelte'
  import { page } from '$app/state'
  import { goto, afterNavigate } from '$app/navigation'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import AppSidebar from '$lib/components/dashboard/app-sidebar.svelte'
  import MobileTrigger from '$lib/components/dashboard/mobile-trigger.svelte'

  let { data, children } = $props()

  // На десктопі сторінка прокручується всередині блока контенту, а не
  // вікно. SvelteKit скидає прокрутку ВІКНА, тож без цього новий екран
  // відкривався б на тій самій висоті, де лишився попередній.
  let insetEl = $state<HTMLElement | null>(null)
  afterNavigate(({ from, to }) => {
    if (from?.url.pathname === to?.url.pathname) return
    insetEl?.scrollTo({ top: 0 })
  })

  // untrack: cookie дає лише ПОЧАТКОВИЙ стан. Далі його веде сам
  // Sidebar.Provider через bind, і перезапис із data згортав би панель
  // на кожній навігації.
  let sidebarOpen = $state(untrack(() => data.sidebarOpen))

  // Онбординг іде без панелі: доки роль не обрано й профіль не
  // заповнено, guardHandle усе одно не пускає нікуди, крім цього
  // екрана, — меню з недоступними пунктами лише відволікає від
  // єдиної дії, яку тут можна зробити.
  let isOnboarding = $derived(
    page.url.pathname.startsWith('/dashboard/onboarding'),
  )

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

{#if isOnboarding}
  <main class="min-h-svh bg-background">{@render children()}</main>
{:else}
  <!-- Помітно вужча за типову для shadcn (16rem): панель зачиняється
       повністю, і що довший її шлях за край екрана, то помітніший сам
       проїзд. 13.5rem — межа, за якою найдовший пункт («Нове замовлення»)
       починає обриватись. -->
  <!-- Рамка й блок: на десктопі контент живе в скругленому блоці з
       відступом 6px від країв вікна, а простір довкола — того ж кольору,
       що й панель (variant="inset" в AppSidebar). Блок має сталу висоту
       екрана й прокручується сам, тож рамка лишається на місці й не
       їде разом зі сторінкою. На телефоні рамки немає: 6px з кожного
       боку там забрали б надто багато від і так вузького екрана. -->
  <Sidebar.Provider
    bind:open={sidebarOpen}
    style="--sidebar-width: 13.5rem; --sidebar-width-icon: 2.25rem;"
    class="md:h-svh md:overflow-hidden"
  >
    <AppSidebar />

    <Sidebar.Inset
      bind:ref={insetEl}
      class="min-w-0 bg-background md:m-1.5! md:ml-0! md:h-[calc(100svh-0.75rem)] md:overflow-y-auto md:rounded-[10px]! md:border md:border-panel-border md:shadow-none"
    >
      <!-- Кнопка панелі лише для мобільного: на десктопі свою кнопку малює
           сам AppSidebar — у шапці, доки панель відкрита, і в лівому
           верхньому куті, коли зачинена. Окремої шапки на дашборді немає
           навмисно — вона забирала б рядок контенту на кожному екрані
           заради однієї кнопки.

           Окремого нижнього меню теж більше немає: Sidebar сам відповідає
           за мобільний режим, а два різні меню рано чи пізно розійшлись би
           складом пунктів. -->
      <MobileTrigger />

      <main class="flex flex-1">
        <div class="min-w-0 flex-1" class:overflow-hidden={isChat}>
          {@render children()}
        </div>
      </main>
    </Sidebar.Inset>

  </Sidebar.Provider>
{/if}
