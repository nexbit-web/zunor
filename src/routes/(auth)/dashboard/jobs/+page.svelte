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

<!--
  flex-col + min-h-(--app-h) потрібні порожньому стану: він бере flex-1 і стає
  по центру сторінки, а не одразу під заголовком.

  Ширина однакова для обох режимів: стрічка майстра більше не сітка
  карток, а такий самий список рядків, і широка колонка розтягувала б
  заголовки на пів екрана.

  Верхнього падінгу тут немає навмисно — його тримає сама шапка
  (`page-head`), бо вона ж і липне до верху; падінг на контейнері
  відсунув би її від краю й зламав прилипання.
-->
<div
  class="mx-auto flex min-h-(--app-h) w-full max-w-3xl flex-col px-4 pb-6 sm:px-6 sm:pb-10"
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
