<script lang="ts">
  import NotificationList from '$lib/components/notifications/notification-list.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<svelte:head>
  <title>Сповіщення · Zunor</title>
</svelte:head>

<!--
  max-w-230 — та сама ширина, що в «Мої заявки» й «Мої відгуки»:
  сторінки-списки в дашборді мають збігатися по колонці.

  flex-col + min-h-svh потрібні лише порожньому стану: він бере flex-1
  і стає по центру всієї сторінки, а не одразу під заголовком.
-->
<div class="mx-auto flex min-h-svh w-full max-w-230 flex-col px-4 py-8 sm:px-6">
  <NotificationList
    initialItems={data.notifications}
    initialNextCursor={data.nextCursor}
    initialUnreadCount={data.unreadCount}
  />
</div>
