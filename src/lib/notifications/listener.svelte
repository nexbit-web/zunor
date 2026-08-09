<script lang="ts">
  // Тонкий компонент: лише монтує стор і стежить за зміною користувача.
  // Уся логіка — у store.svelte.ts.
  //
  // Живе в кореневому layout, а не в хедері: хедер прихований на всьому
  // /dashboard, через що тости не з'являлись саме там, де люди працюють.

  import { page } from '$app/state'
  import { notifications } from './store.svelte'

  const userId = $derived(page.data.session?.user?.id ?? null)

  $effect(() => {
    const id = userId
    if (!id) {
      notifications.disconnect()
      return
    }

    // Початковий лічильник стор тягне сам, одним запитом за сесію —
    // раніше він приходив із серверного лейауту на кожній навігації.
    notifications.connect(id)
    return () => notifications.disconnect()
  })
</script>
