<script lang="ts">
  import { goto } from '$app/navigation'
  import MasterOnboarding from '$lib/components/onboarding/master-onboarding.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<svelte:head><title>Профіль виконавця · Zunor</title></svelte:head>
<!-- Покроковий майстер займає весь екран сам: шапка з прогресом угорі,
     кнопки прибиті до низу. Зовнішніх відступів тут не треба. -->
<MasterOnboarding
  {data}
  mode="onboarding"
  onBack={() => goto('/dashboard/onboarding')}
/>
