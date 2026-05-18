<!-- src/routes/(auth)/jobs/[id]/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types'
  import JobClientView from './job-client-view.svelte'
  import JobMasterView from './job-master-view.svelte'

  let { data }: { data: PageData } = $props()
</script>

<svelte:head>
  <title>{data.job.title} · Zunor</title>
</svelte:head>

{#if data.isOwner}
  <JobClientView {data} />
{:else}
  <JobMasterView {data} />
{/if}
