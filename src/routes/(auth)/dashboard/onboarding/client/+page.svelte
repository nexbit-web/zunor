<script lang="ts">
  import { goto } from '$app/navigation'
  import ClientOnboarding from '$lib/components/onboarding/client-onboarding.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<svelte:head><title>Профіль замовника · Zunor</title></svelte:head>
<!-- Покроковий майстер займає весь екран сам: шапка з прогресом угорі,
     кнопки прибиті до низу. Зовнішніх відступів тут не треба. -->
<ClientOnboarding
  {data}
  mode="onboarding"
  onBack={() => goto('/dashboard/onboarding')}
/>
