<script lang="ts">
  import { goto } from '$app/navigation'
  import ClientOnboarding from '$lib/components/onboarding/client-onboarding.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<svelte:head><title>Профіль замовника · Zunor</title></svelte:head>
<div class="py-5">
  <ClientOnboarding
    {data}
    mode="onboarding"
    onBack={() => goto('/dashboard/onboarding')}
  />
</div>
