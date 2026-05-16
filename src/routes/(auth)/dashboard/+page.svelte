<script lang="ts">
  import FreelancerProfileView from '$lib/components/profile/freelancer-profile-view.svelte'
  import ClientProfileView from '$lib/components/profile/client-profile-view.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<svelte:head>
  <title>Мій профіль · Zunor</title>
</svelte:head>

{#if data.profileType === 'master'}
  <FreelancerProfileView
    user={data.user}
    isOwner={data.isOwner}
    isAuthenticated={data.isAuthenticated}
  />
{:else}
  <ClientProfileView
    user={data.user}
    isOwner={data.isOwner}
    isAuthenticated={data.isAuthenticated}
  />
{/if}
