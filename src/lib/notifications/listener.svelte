<script lang="ts">
  // Тонкий компонент: лише монтує стор і стежить за зміною користувача.
  // Уся логіка — у store.svelte.ts.
  //
  // Живе в кореневому layout, а не в хедері: хедер прихований на всьому
  // /dashboard, через що тости не з'являлись саме там, де люди працюють.

  import { page } from '$app/state'
  import { notifications } from './store.svelte'

  const userId = $derived(page.data.session?.user?.id ?? null)
  const initialUnread = $derived(page.data.badges?.notifications ?? 0)

  $effect(() => {
    const id = userId
    if (!id) {
      notifications.disconnect()
      return
    }

    notifications.connect(id, initialUnread)
    return () => notifications.disconnect()
  })
</script>
