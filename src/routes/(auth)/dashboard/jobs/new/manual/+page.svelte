<script lang="ts">
  // Заявка без чату. Сам майстер — $lib/components/jobs/job-wizard: той
  // самий компонент відкриває й редагування заявки (jobs/[id]/edit).
  import JobWizard from '$lib/components/jobs/job-wizard.svelte'
</script>

<svelte:head>
  <title>Замовити прибирання · Zunor</title>
</svelte:head>

<JobWizard />
