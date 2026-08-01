<!-- src/routes/(auth)/dashboard/messages/+layout.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { unlockAudio, loadMutePreference } from '$lib/sound/notification'
  import ChatBackground from '$lib/components/chat/chat-background.svelte'
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

<!-- relative — щоб шпалери позиціонувались відносно розділу -->
<div class="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
  <ChatBackground />

  <!-- z-10 піднімає контент над шаром шпалер -->
  <div class="relative z-10 min-h-0 flex-1">
    {@render children()}
  </div>
</div>
