<script lang="ts">
  import './layout.css'
  import { ModeWatcher } from 'mode-watcher'
  import Header from '$lib/components/header/index.svelte'
  import { page } from '$app/state'
  import Footer from '$lib/components/footer/index.svelte'
  import { NotificationsListener } from '$lib/notifications'
  const hiddenLayoutRoutes = [
    '/messages',
    '/terms',
    '/privacy',
    '/dashboard',
    '/user/login',
    '/user/register',
    '/user/verify-email',
  ]
  const hideHeader = $derived(
    hiddenLayoutRoutes.some((route) => page.url.pathname.startsWith(route)),
  )
  const hideFooter = $derived(
    hiddenLayoutRoutes.some((route) => page.url.pathname.startsWith(route)),
  )

  import NProgress from 'nprogress'
  import 'nprogress/nprogress.css'
  import { beforeNavigate, afterNavigate } from '$app/navigation'
  import { Toaster } from 'svelte-hot-french-toast'

  let { children } = $props()

  NProgress.configure({
    showSpinner: false,
  })

  beforeNavigate(() => {
    NProgress.start()
  })

  afterNavigate(() => {
    NProgress.done()
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
<ModeWatcher />
{#if !hideHeader}
  <Header />
{/if}

{@render children()}
{#if !hideFooter}
  <Footer />
{/if}
