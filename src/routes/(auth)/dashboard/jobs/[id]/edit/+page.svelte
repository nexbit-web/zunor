<script lang="ts">
  // Редагування заявки — той самий майстер, що й заявка без чату, у
  // режимі `edit`: відкривається на зведенні з кнопками «Змінити».
  import JobWizard from '$lib/components/jobs/job-wizard.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<svelte:head>
  <title>Редагування заявки · Zunor</title>
</svelte:head>

{#key data.job.id}
  <JobWizard edit={data.job} />
{/key}
