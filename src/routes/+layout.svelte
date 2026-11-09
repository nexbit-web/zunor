<script lang="ts">
  import './layout.css'
  import { ModeWatcher, mode } from 'mode-watcher'
  import { isThemedPath } from '$lib/theme-scope'
  import Header from '$lib/components/header/index.svelte'
  import { navigating, page } from '$app/state'
  import Footer from '$lib/components/footer/index.svelte'
  import { NotificationsListener } from '$lib/notifications'
  const hiddenLayoutRoutes = [
    '/messages',
    '/terms',
    '/privacy',
    '/dashboard',
    '/admin',
    '/user/login',
    '/user/register',
    '/user/verify-email',
    '/user/forgot',
    '/user/reset-password',
  ]
  // Сторінка помилки — окремий екран із відсвітом угорі: шапка лендингу
  // відрізала б смугу посередині, а підвал ставив би під неї ще екран.
  const hideHeader = $derived(
    page.error !== null ||
      hiddenLayoutRoutes.some((route) => page.url.pathname.startsWith(route)),
  )
  const hideFooter = $derived(
    page.error !== null ||
      hiddenLayoutRoutes.some((route) => page.url.pathname.startsWith(route)),
  )

  import NProgress from 'nprogress'
  import 'nprogress/nprogress.css'
  import { Toaster } from 'svelte-hot-french-toast'

  let { children } = $props()

  NProgress.configure({
    showSpinner: false,
  })

  // Смуга вгорі — лише для ПОВІЛЬНИХ переходів. Швидкий перехід
  // (дані з кешу, легкий лоадер) закінчується раніше за затримку, і
  // смуги не видно взагалі: інакше вона блимала б на кожен клік. Довше
  // ~100 мс людина вже чекає, але між 100 і 200 мс смуга встигала б лише
  // смикнутись і зникнути — тому 200.
  //
  // Від navigating, а не beforeNavigate/afterNavigate: скасований перехід
  // не кличе afterNavigate, і смуга лишалась висіти. Ефект залежить від
  // булевого значення, тож перехід, що перебив інший, не перезапускає
  // таймер і не «добігає» смугу посередині.
  // Темна тема — лише в кабінеті ($lib/theme-scope). Вибір людини
  // зберігає mode-watcher, а клас на <html> ставимо тут: поза кабінетом
  // сторінка світла, і перехід у кабінет та назад перемикає її сам.
  // До першого кадру те саме робить скрипт в app.html. Поки системна
  // тема ще не відома (mode.current порожній) — не чіпаємо, інакше клас
  // блимнув би.
  const themed = $derived(isThemedPath(page.url.pathname))

  // Палітра кабінету (клас in-app, layout.css) — за тим самим правилом.
  $effect(() => {
    document.documentElement.classList.toggle('in-app', themed)
  })

  $effect(() => {
    const current = mode.current
    if (current === undefined) return
    document.documentElement.classList.toggle(
      'dark',
      themed && current === 'dark',
    )
  })

  const PROGRESS_DELAY = 200
  const isNavigating = $derived(navigating.to !== null)

  $effect(() => {
    if (!isNavigating) return
    const timer = setTimeout(() => NProgress.start(), PROGRESS_DELAY)
    return () => {
      clearTimeout(timer)
      // Не стартувала — done() нічого не робить.
      NProgress.done()
    }
  })
</script>

<Toaster
  toastOptions={{
    duration: 4000,
    class: 'app-toast',
    style:
      'background: color-mix(in srgb, var(--card) 88%, transparent); color: var(--foreground); border: 1px solid color-mix(in srgb, var(--foreground) 10%, transparent); box-shadow: 0 12px 32px -12px rgba(0,0,0,0.24), 0 2px 6px rgba(0,0,0,0.06); backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%); padding: 11px 14px; font-size: 13.5px; line-height: 1.35; font-weight: 400; letter-spacing: -0.01em; border-radius: 24px;',
    iconTheme: {
      primary: 'var(--primary)',
      secondary: 'var(--primary-foreground)',
    },
  }}
/>
<NotificationsListener />
<!-- Порожній darkClassNames: клас `dark` ставить ефект вище, а не
     mode-watcher — інакше лендинг темнів би разом із кабінетом. -->
<ModeWatcher darkClassNames={[]} />
{#if !hideHeader}
  <Header />
{/if}

{@render children()}
{#if !hideFooter}
  <Footer />
{/if}
