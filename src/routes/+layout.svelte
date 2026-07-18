<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import './layout.css'
  import { ModeWatcher } from 'mode-watcher'
  import Header from '$lib/components/header/index.svelte'
  import { page } from '$app/state'
  import { Toaster } from '$lib/components/toast'
  import Footer from '$lib/components/footer/index.svelte'

  // без хедера і футера
  const hiddenLayoutRoutes = ['/messages', '/jobs/new/ai', '/terms', '/privacy']
  const hideHeader = $derived(
    hiddenLayoutRoutes.some((route) => page.url.pathname.startsWith(route)),
  )
  const hideFooter = $derived(
    hiddenLayoutRoutes.some((route) => page.url.pathname.startsWith(route)),
  )

  import NProgress from 'nprogress'
  import 'nprogress/nprogress.css'
  import { beforeNavigate, afterNavigate } from '$app/navigation'

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

<Toaster position="top-right" />
<ModeWatcher />

{#if !hideHeader}
  <Header />
{/if}

{@render children()}
{#if !hideFooter}
  <Footer />
{/if}
