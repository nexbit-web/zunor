<!-- src/routes/+layout.svelte -->
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
  // position="top-end"
  toastOptions={{
    duration: 4000,
    class: 'app-toast',
    style:
      'background: var(--card); color: var(--foreground); border: 1px solid var(--border);  box-shadow: 0 4px 16px -4px rgba(0,0,0,0.25); padding: 10px 14px; font-size: 13.5px; border-radius: 1rem;',
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
