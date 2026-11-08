<script lang="ts">
  import type { PageData } from './$types'
  import JobClientView from './job-client-view.svelte'
  import JobMasterView from './job-master-view.svelte'

  let { data }: { data: PageData } = $props()

  const pageTitle = $derived(`${data.job.title} · Zunor`)
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<!--
  Контейнер один на обидва подання — той самий, що в списку заявок
  (`jobs/+page.svelte`): заявка, відкрита зі списку, лежить у тій самій
  колонці, а не стрибає вужче. Раніше кожне подання загортало себе ще
  раз (свої поля, своя ширина 540px), і сторінка сиділа вузькою смужкою
  посеред екрана.

  Верхнього падінгу немає навмисно — його тримає PageHead: на телефоні
  відступ там більший, під плаваючу кнопку меню.
-->
<div class="mx-auto w-full max-w-3xl px-4 pb-10 sm:px-6 sm:pb-14">
  <!-- Доступ уже перевірено в +page.server.ts: сюди потрапляє лише власник
       або релевантний майстер. Тож не-власник тут — завжди майстер. -->
  {#if data.isOwner}
    <JobClientView {data} />
  {:else}
    <JobMasterView {data} />
  {/if}
</div>
