<script lang="ts">
  import { onMount } from 'svelte'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { unlockAudio, loadMutePreference } from '$lib/sound/notification'
  import type { LayoutData } from './$types'

  let {
    data,
    children,
  }: { data: LayoutData; children: import('svelte').Snippet } = $props()

  onMount(() => {
    chatStore.setChats(data.chats)
    chatStore.subscribeToUserEvents(data.currentUserId)
    loadMutePreference()
    document.addEventListener('click', unlockAudio, { once: true })
  })
</script>

<!--
  Шпалери переїхали звідси в саме вікно чату (chat-window.svelte).
  Тут вони лежали під УСІМ розділом, тобто й під списком чатів: сайдбар
  просвічувався візерунком і через це відривався від решти дашборда.
-->
<div class="flex h-full min-h-0 w-full flex-col overflow-hidden">
  {@render children()}
</div>
