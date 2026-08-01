<!-- src/routes/(auth)/jobs/+page.svelte -->
<script lang="ts">
  import ClientJobs from '$lib/components/jobs/client-jobs.svelte'
  import MasterFeed from '$lib/components/jobs/master-feed.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  // Один маршрут — два режими: 'mine' (заявки клієнта) і 'feed' (стрічка майстра).
  const pageTitle = $derived(
    data.view === 'mine' ? 'Мої заявки' : 'Знайти роботу',
  )
</script>

<svelte:head>
  <title>{pageTitle} · Zunor</title>
</svelte:head>

<div
  class="mx-auto px-2.5 py-3 sm:py-7 {data.view === 'mine'
    ? 'max-w-3xl sm:px-6'
    : 'max-w-230 sm:px-8'}"
>
  {#if data.view === 'mine'}
    <ClientJobs
      initialJobs={data.jobs}
      initialNextCursor={data.nextCursor}
      counts={data.counts}
      filters={data.filters}
    />
  {:else}
    <MasterFeed
      initialJobs={data.jobs}
      initialNextCursor={data.nextCursor}
      blockReason={data.blockReason}
      filters={data.filters}
    />
  {/if}
</div>
