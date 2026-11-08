<script lang="ts">
  import { untrack } from 'svelte'
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import AppSidebar from '$lib/components/dashboard/app-sidebar.svelte'
  import MobileTrigger from '$lib/components/dashboard/mobile-trigger.svelte'

  let { data, children } = $props()

  // Прокручується сам документ, а не блок контенту (див. вікно нижче),
  // тож прокрутку між сторінками скидає сам SvelteKit — власного
  // скидання тут не треба.

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

  // Повідомлення — окремий екран зі своїм меню ліворуч (список чатів):
  // панель дашборда відʼїжджає за край, а повертає її кнопка «Назад» у
  // тому меню ($lib/utils/entry-point). Налаштування — ні: там панель
  // лишається на місці поруч із меню розділів.
  let sidebarAway = $derived(
    page.url.pathname.startsWith('/dashboard/messages'),
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
  <!-- Панель — за референсом у docs/: розгорнута 15rem (240px), рейка
       57px — 8 + квадрат 40 + 8 і 1px лінії праворуч (border-e у
       variant="sidebar" лежить усередині ширини). Контент стоїть
       упритул до панелі, без вікна й відступів: межу тримає лінія.

       Прокручується сам документ, панель при цьому стоїть (вона fixed).
       Виняток — чати (isChat): там контент рівно на екран, бо композер
       мусить стояти внизу, а прокручується стрічка. -->
  <Sidebar.Provider
    bind:open={sidebarOpen}
    style="--sidebar-width: 15rem; --sidebar-width-icon: calc(3.5rem + 1px);"
  >
    <AppSidebar away={sidebarAway} />

    <!-- Чат отримує ЖОРСТКУ висоту екрана й на телефоні теж. Без неї
         ланцюжок h-full нічого не тримав: main за замовчуванням не
         менший за свій вміст (min-height: auto), тож стрічка разом зі
         спейсером розтягувала сторінку, композер їхав за край, а спейсер,
         що рахується від висоти стрічки, ріс сам від себе. -->
    <Sidebar.Inset
      class={[
        'min-w-0 bg-background',
        // Чат — рівно на екран, решта — не нижча за екран і росте з
        // вмістом.
        isChat ? 'h-svh overflow-hidden' : 'min-h-svh',
      ]}
    >
      <!-- Кнопка панелі лише для мобільного: на десктопі свою кнопку малює
           сам AppSidebar — у шапці, доки панель відкрита, і в лівому
           верхньому куті, коли зачинена. Окремої шапки на дашборді немає
           навмисно — вона забирала б рядок контенту на кожному екрані
           заради однієї кнопки.

           Окремого нижнього меню теж більше немає: Sidebar сам відповідає
           за мобільний режим, а два різні меню рано чи пізно розійшлись би
           складом пунктів.

           У повідомленнях на її місці — «Назад» (малює сам розділ):
           меню там своє, а панель дашборда відʼїхала. -->
      {#if !sidebarAway}
        <MobileTrigger />
      {/if}

      <!-- min-h-0 знімає ту саму «не менше за вміст»: лише тоді висота
           main — це висота Inset, і h-full у чаті справді щось означає. -->
      <main class="flex flex-1" class:min-h-0={isChat}>
        <div class="min-w-0 flex-1" class:overflow-hidden={isChat}>
          {@render children()}
        </div>
      </main>
    </Sidebar.Inset>
  </Sidebar.Provider>
{/if}
