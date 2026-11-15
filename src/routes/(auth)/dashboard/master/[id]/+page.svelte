<script lang="ts">
  import FreelancerProfileView from '$lib/components/profile/freelancer-profile-view.svelte'
  import ReportButton from '$lib/components/reports/report-button.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<svelte:head><title>{data.user.name} · Zunor</title></svelte:head>

<FreelancerProfileView user={data.user} isOwner={false} isAuthenticated />

<div class="flex justify-center pb-10">
  <ReportButton
    targetId={data.user.id}
    targetName={data.user.name}
    targetRole="MASTER"
  />
</div>
