<script lang="ts">
  import { goto } from '$app/navigation'
  import MasterOnboarding from '$lib/components/onboarding/master-onboarding.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<svelte:head><title>Профіль виконавця · Zunor</title></svelte:head>
<div class="py-5">
  <MasterOnboarding
    {data}
    mode="onboarding"
    onBack={() => goto('/dashboard/onboarding')}
  />
</div>
