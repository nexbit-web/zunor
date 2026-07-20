<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import { signOut } from '$lib/auth-client'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { disconnectPusher } from '$lib/pusher-client'

  import DarkMode from '$lib/components/Dark-mode.svelte'
  import { Button } from '$lib/components/ui/button'
  import toast from 'svelte-hot-french-toast'

  async function handleSignOut() {
    chatStore.unsubscribeAll()
    disconnectPusher()

    await signOut()
    await invalidateAll()

    goto('/')
    toast('До зустрічі!', { icon: '👋' })
  }
</script>

<div class="space-y-4">
  <DarkMode />

  <Button
    variant="destructive"
    onclick={handleSignOut}
  >
    Вийти з акаунта
  </Button>
</div>