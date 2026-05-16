<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import './layout.css'
  import favicon from '$lib/assets/favicon.svg'
  import { ModeWatcher } from 'mode-watcher'
  import Header from '$lib/components/header/index.svelte'
  import { page } from '$app/stores'
  import { Toaster } from 'svelte-hot-french-toast'

  // На /messages чат працює full-screen без хедера сайту
  const hideHeader = $derived($page.url.pathname.startsWith('/messages'))

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

<Toaster
  position="top-center"
  toastOptions={{
    duration: 4000,
    style:
      'background: #ffffff; color: #0a0a0a; border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 12px; font-size: 14px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);',
    iconTheme: {
      primary: 'var(--primary)',
      secondary: '#ffffff',
    },
  }}
/>

<ModeWatcher />
<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{#if !hideHeader}
  <Header />
{/if}

{@render children()}
