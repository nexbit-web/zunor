<script lang="ts">
  import { goto } from '$app/navigation'
  import ClientOnboarding from '$lib/components/onboarding/client-onboarding.svelte'
  import MasterOnboarding from '$lib/components/onboarding/master-onboarding.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Hammer } from 'lucide-svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  const isMaster = $derived(data.user.role === 'MASTER')
</script>

<svelte:head><title>Мій профіль · Zunor</title></svelte:head>
<div class="py-8" >
{#if isMaster}
  <MasterOnboarding {data} mode="edit" onBack={() => goto('/dashboard')} />
{:else}
  <ClientOnboarding {data} mode="edit" onBack={() => goto('/dashboard')} />
{/if}
</div>