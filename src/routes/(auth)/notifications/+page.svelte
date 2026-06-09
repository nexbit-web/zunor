<!-- src/routes/(auth)/notifications/+page.svelte -->
<script lang="ts">
  import NotificationList from '$lib/components/notifications/notification-list.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<svelte:head>
  <title>Сповіщення · Zunor</title>
</svelte:head>

<div class="max-w-230 mx-auto px-4 sm:px-6 py-6 sm:py-10">
  <NotificationList
    userId={data.userId}
    initialItems={data.notifications}
    initialNextCursor={data.nextCursor}
    initialUnreadCount={data.unreadCount}
  />
</div>
