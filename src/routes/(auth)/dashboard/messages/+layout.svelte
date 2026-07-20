<!-- src/routes/(auth)/dashboard/messages/+layout.svelte -->
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
  class="h-full w-full min-h-0 overflow-hidden flex flex-col"
  style="background-color: var(--background)"
>
  <div class="flex-1 min-h-0">
    {@render children()}
  </div>
</div>