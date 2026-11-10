<script lang="ts">
  import ClientProfileView from '$lib/components/profile/client-profile-view.svelte'
  import ReportButton from '$lib/components/reports/report-button.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<ClientProfileView
  user={data.user}
  isOwner={data.isOwner}
  isAuthenticated={data.isAuthenticated}
/>

{#if !data.isOwner}
  <div class="flex justify-center pb-10">
    <ReportButton
      targetId={data.user.id}
      targetName={data.user.name}
      targetRole="CLIENT"
    />
  </div>
{/if}
