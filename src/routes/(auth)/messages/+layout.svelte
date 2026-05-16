<!-- src/routes/(auth)/messages/+layout.svelte -->
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

<div
  class="h-screen w-screen overflow-hidden flex flex-col"
  style="background-color: var(--background)"
>
  {@render children()}
</div>
