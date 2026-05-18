<!-- src/routes/(auth)/jobs/+page.svelte -->
<script lang="ts">
  import ClientJobs from '$lib/components/jobs/client-jobs.svelte'
  import MasterFeed from '$lib/components/jobs/master-feed.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<svelte:head>
  <title>{data.view === 'mine' ? 'Мої заявки' : 'Знайти роботу'} · Zunor</title>
</svelte:head>

<div class="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
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
