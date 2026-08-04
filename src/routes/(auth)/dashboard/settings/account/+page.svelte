<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import { signOut } from '$lib/auth-client'
  import { chatStore } from '$lib/stores/chat-store.svelte'
  import { disconnectPusher } from '$lib/pusher-client'
  import { SettingsGroup, SettingsRow } from '$lib/components/settings'
  import { Button } from '$lib/components/ui/button'
  import toast from 'svelte-hot-french-toast'
  import { WaveIcon } from '$lib/components/icons'
  let signingOut = $state(false)

  async function handleSignOut(): Promise<void> {
    if (signingOut) return
    signingOut = true

    try {
      // Спершу рвемо реалтайм: інакше лишиться відкритий сокет
      // на канал користувача, якого вже немає в сесії.
      chatStore.unsubscribeAll()
      disconnectPusher()

      await signOut()
      await invalidateAll()
      await goto('/')
      toast('До зустрічі!', { icon: WaveIcon })
    } catch {
      signingOut = false
      toast.error('Не вдалося вийти. Спробуйте ще раз.')
    }
    // При успіху не скидаємо: сторінка вже пішла на головну.
  }
</script>

<SettingsGroup title="Сесія">
  <SettingsRow
    label="Вийти з акаунта"
    description="Знадобиться увійти знову, щоб отримувати замовлення."
  >
    {#snippet control()}
      <Button
        variant="outline"
        onclick={handleSignOut}
        disabled={signingOut}
        aria-busy={signingOut}
        class="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        {signingOut ? 'Виходимо...' : 'Вийти'}
      </Button>
    {/snippet}
  </SettingsRow>
</SettingsGroup>
