<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import './layout.css'
  import { ModeWatcher } from 'mode-watcher'
  import Header from '$lib/components/header/index.svelte'
  import { page } from '$app/stores'
  import { Toaster } from '$lib/components/toast'
  import Footer from '$lib/components/footer/index.svelte'

  // На /messages чат працює full-screen без хедера сайту
  const hideHeader = $derived($page.url.pathname.startsWith('/messages'))
  const hideFooter = $derived($page.url.pathname.startsWith('/messages'))

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
