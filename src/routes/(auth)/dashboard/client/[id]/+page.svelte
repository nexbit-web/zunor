<script lang="ts">
  import ClientProfileView from '$lib/components/profile/client-profile-view.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<ClientProfileView
  user={data.user}
  isOwner={data.isOwner}
  isAuthenticated={data.isAuthenticated}
/>
