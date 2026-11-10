<script lang="ts">
  import FreelancerProfileView from '$lib/components/profile/freelancer-profile-view.svelte'
  import ClientProfileView from '$lib/components/profile/client-profile-view.svelte'
  import NotificationsPreview from '$lib/notifications/preview.svelte'
  import { dev } from '$app/environment'
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { takePendingTask } from '$lib/zunor/pending-task'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  // Задача, написана на головній до реєстрації, — сюди приходять усі шляхи
  // входу (пошта, Google, після онбордингу). Майстрові заявка ні до чого:
  // його задача лишається лежати й згасне за TTL.
  onMount(() => {
    if (data.profileType !== 'client') return
    const task = takePendingTask()
    if (task)
      goto(`/dashboard/jobs/new?q=${encodeURIComponent(task)}`, {
        replaceState: true,
      })
  })
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

<!-- Кнопка перевірки сповіщень — лише під час розробки. -->
{#if dev}
  <NotificationsPreview />
{/if}
